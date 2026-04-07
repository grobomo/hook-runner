// WHY: Claude committed directly to main, bypassing review.
"use strict";
// Branch-PR gate: enforces Model C workflow.
// Gates Edit, Write, AND Bash (state-changing commands).
//
// DESIGN DECISIONS:
//
// 1. git commit is ALWAYS blocked on main — even for specs/docs.
//    Why: allowing commits on main but blocking push creates a stuck state
//    where local main diverges from origin and hooks block the fix.
//    All work goes through branches + PRs, no exceptions.
//
// 2. Repair commands ARE allowed on main (reset to origin, branch -f, checkout).
//    Why: if main gets into a bad state (accidental commit before hook existed),
//    we need a way out without disabling hooks. Repair = moving main backward
//    toward origin or switching away. Never forward (new work).
//
// 3. Edit/Write allowlist lets specs/infra files be edited on any branch.
//    But committing those edits still requires a task branch (rule 1).
//
// 4. gh pr merge gated on .test-results/T<NNN>.passed marker file.
//    Test must be run and pass before merge is allowed.
//
// BRANCH MODEL (Model C):
// - Feature branch per spec (e.g. 005-speckit-modularity)
// - Task sub-branch per task (e.g. 005-T001-scope-validator)
// - One PR per task into the feature branch
// - Feature branch PRs into main when spec is complete
var fs = require("fs");
var path = require("path");

// Read-only bash commands that are always allowed (no task branch needed)
var READ_ONLY_PATTERNS = [
  /^\s*git\s+(status|log|diff|branch|show|remote|fetch|stash list)/,
  /^\s*git\s+rev-parse/,
  /^\s*git\s+config\s+--get/,
  /^\s*(ls|cat|head|tail|wc|echo|printf|date|whoami|hostname|pwd|which|type)\b/,
  /^\s*(grep|rg|find|tree|file|stat|du|df)\b/,
  /^\s*(docker\s+(ps|images|inspect|logs))\b/,
  /^\s*aws\s+(s3\s+ls|cloudformation\s+describe|ecr\s+describe|secretsmanager\s+describe|sts\s+get)/,
  /^\s*gh\s+(pr\s+list|pr\s+view|pr\s+status|issue|auth\s+status|api)/,
  /^\s*gh\s+auth\s+switch/,
  /^\s*(node|python3?)\s+-[ec]\s/,  // one-liner evals for checks
  /^\s*bash\s+scripts\/test\//,     // test scripts are always safe
  /^\s*curl\b/,
  /^\s*chmod\b/,
  /^\s*sleep\b/,
  /^\s*MSYS_NO_PATHCONV/,
];

// State-changing commands that require a task branch
var STATE_CHANGE_PATTERNS = [
  /^\s*git\s+(commit|push|merge|rebase|cherry-pick|reset|tag)/,
  /^\s*git\s+checkout\s+-b/,  // creating branches is fine, but validate name
  /^\s*bash\s+.*deploy/,
  /^\s*bash\s+.*build/,
  /^\s*gh\s+pr\s+(create|merge|close|edit)/,
  /^\s*scp\b/,
  /^\s*docker\s+(build|push|tag|run|stop|exec)/,
];

// Common verbs for branch naming (verb-noun convention)
var VALID_VERBS = [
  "add", "build", "create", "deploy", "enable", "enforce", "extend", "extract",
  "fix", "implement", "improve", "integrate", "migrate", "move", "rebuild",
  "refactor", "remove", "replace", "restore", "rewrite", "scale", "setup",
  "split", "test", "update", "upgrade", "validate", "wire",
];

function validateBranchName(name) {
  // Task branches: NNN-TNNN-slug — always valid (slug is freeform)
  if (/^\d{3}-T\d{3}/.test(name)) return null;

  // Feature branches: NNN-verb-noun
  var featureMatch = name.match(/^(\d{3})-(.+)$/);
  if (!featureMatch) {
    return "Branch name must start with a 3-digit spec number: NNN-verb-noun";
  }

  var slug = featureMatch[2];

  // No "and" — monolith features must be split
  if (/\band\b/i.test(slug)) {
    return "Branch name contains 'and' — split into separate features.\n" +
      "Example: '007-scale-and-dashboard' → '007-scale-fleet' + '008-build-dashboard'";
  }

  // Must start with a verb
  var firstWord = slug.split("-")[0].toLowerCase();
  if (VALID_VERBS.indexOf(firstWord) === -1) {
    return "Branch name must use verb-noun convention (e.g. 'scale-fleet', 'build-dashboard').\n" +
      "'" + firstWord + "' is not a recognized verb. Valid verbs: " +
      VALID_VERBS.slice(0, 10).join(", ") + ", ...";
  }

  return null;
}

function getBranch() {
  try {
    // Read .git/HEAD directly — avoids spawning git (slow on Windows, can timeout)
    var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
    var head = fs.readFileSync(path.join(projectDir, ".git", "HEAD"), "utf-8").trim();
    if (head.indexOf("ref: refs/heads/") === 0) return head.slice(16);
    return "HEAD";
  } catch(e) { return ""; }
}

function isTaskBranch(branch) {
  // Matches: 004-T016-slug, feature/T001, task-123-slug, NNN-TNNN-*
  return /\/T\d{3}/.test(branch) || /^task-\d+/.test(branch) || /^\d{3}-T\d{3}/.test(branch);
}

module.exports = function(input) {
  var tool = input.tool_name;

  // --- Gate for Edit/Write: block on main or bare feature branch ---
  if (tool === "Edit" || tool === "Write") {
    var targetFile = "";
    try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
    if (!targetFile) return null;
    var norm = targetFile.replace(/\\/g, "/");

    // Allow bootstrap/config/spec/planning/test files on any branch
    var allowPatterns = [
      /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/, /README\.md$/,
      /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
      /\.github\//, /\/hooks\//, /\/rules\//,
      /\.gitignore$/, /scripts\/test\//, /\.json$/,
    ];
    var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
    if (home && norm.indexOf(home + "/.claude/") === 0) return null;
    for (var i = 0; i < allowPatterns.length; i++) {
      if (allowPatterns[i].test(norm)) return null;
    }

    var branch = getBranch();
    if (!branch) return null;

    if (branch === "main" || branch === "master") {
      return {
        decision: "block",
        reason: "BRANCH GATE: Cannot edit code on " + branch + ".\n" +
          "WHY: The dev team monitors all work via GitHub PRs. Edits on main are invisible.\n" +
          "Every change must be a PR so the team can see what's happening and why.\n" +
          "FIX: git checkout -b <NNN>-<verb-noun> → git checkout -b <NNN>-T<NNN>-<slug>"
      };
    }

    if (!isTaskBranch(branch)) {
      if (/scripts\//.test(norm) || /cloudformation\//.test(norm)) return null;
      return {
        decision: "block",
        reason: "BRANCH GATE: On feature branch '" + branch + "' but not a task branch.\n" +
          "WHY: One PR per task = the dev team sees each unit of work individually.\n" +
          "Committing to a bare feature branch bundles changes invisibly.\n" +
          "FIX: git checkout -b " + branch.split("-")[0] + "-T<NNN>-<slug>"
      };
    }
    return null;
  }

  // --- Gate for Bash: block state-changing commands without task branch ---
  if (tool === "Bash") {
    var cmd = "";
    try { cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || ""; } catch(e) { cmd = (input.tool_input || {}).command || ""; }
    if (!cmd) return null;

    // Always allow read-only commands
    for (var r = 0; r < READ_ONLY_PATTERNS.length; r++) {
      if (READ_ONLY_PATTERNS[r].test(cmd)) return null;
    }

    // Early check: git commit on main is ALWAYS blocked (no allowlist bypass)
    var earlyBranch = getBranch();
    if ((earlyBranch === "main" || earlyBranch === "master") && /^\s*git\s+commit/.test(cmd)) {
      return {
        decision: "block",
        reason: "BRANCH GATE: git commit blocked on " + earlyBranch + ".\n" +
          "WHY: Commits on main are invisible to the dev team.\n" +
          "Even specs/docs must go through PRs so everyone sees the change and the reason.\n" +
          "FIX: git checkout -b <NNN>-<verb-noun>"
      };
    }

    // Check if this is a state-changing command
    var isStateChange = false;
    for (var s = 0; s < STATE_CHANGE_PATTERNS.length; s++) {
      if (STATE_CHANGE_PATTERNS[s].test(cmd)) { isStateChange = true; break; }
    }
    if (!isStateChange) return null; // unknown commands pass through

    // Validate branch names on git checkout -b regardless of current branch
    if (/git\s+checkout\s+-b/.test(cmd)) {
      var newBranch = cmd.match(/git\s+checkout\s+-b\s+(\S+)/);
      if (newBranch) {
        var nameErr = validateBranchName(newBranch[1]);
        if (nameErr) {
          return { decision: "block", reason: "BRANCH NAME GATE: " + nameErr };
        }
      }
      return null; // valid name, allow creation
    }

    var branch = earlyBranch; // reuse from early commit check
    if (!branch) return null;

    if (branch === "main" || branch === "master") {
      // Allow repair commands that move main BACKWARD toward origin
      if (/git\s+reset\s+--(soft|hard)\s+.*origin/.test(cmd)) return null;
      if (/git\s+reset\s+--(soft|hard)\s+HEAD~/.test(cmd)) return null;
      if (/git\s+branch\s+-f\s+main\s+origin/.test(cmd)) return null;
      if (/git\s+checkout\s+-b/.test(cmd)) return null;  // validated earlier
      if (/git\s+checkout\s+\S/.test(cmd) && !/git\s+checkout\s+(main|master)/.test(cmd)) return null;  // switching away from main

      return {
        decision: "block",
        reason: "BRANCH GATE: State-changing command blocked on " + branch + ".\n" +
          "WHY: All work must be visible as PRs for team collaboration.\n" +
          "Deploying/committing from main bypasses the PR trail.\n" +
          "FIX: Create a feature branch and task branch first.\n" +
          "Repair allowed: git reset --soft HEAD~N, git branch -f main origin/main\n" +
          "Command: " + cmd.substring(0, 80)
      };
    }

    // Allow repair/recovery commands on ANY branch (even non-task, even detached HEAD)
    // WHY: rebase --abort, merge --abort, etc. are recovery operations, not new work.
    // Blocking them traps you in a broken state with no way out.
    if (/git\s+rebase\s+--(abort|quit|skip)/.test(cmd)) return null;
    if (/git\s+merge\s+--abort/.test(cmd)) return null;
    if (/git\s+cherry-pick\s+--abort/.test(cmd)) return null;
    if (/gh\s+pr\s+(close|view|list|status|checks)/.test(cmd)) return null;

    if (!isTaskBranch(branch)) {
      if (/git\s+checkout\s+-b/.test(cmd)) return null;  // validated earlier
      // Allow git push -u (setting up tracking) on feature branches
      if (/git\s+push\s+-u/.test(cmd)) return null;
      // Allow git branch -m (renaming branches) — organizational, not new work
      if (/git\s+branch\s+-[mM]/.test(cmd)) return null;
      // Allow git push --delete (cleaning up old remote branches)
      if (/git\s+push\s+origin\s+--delete/.test(cmd)) return null;

      return {
        decision: "block",
        reason: "BRANCH GATE: State-changing command blocked on bare feature branch '" + branch + "'.\n" +
          "WHY: Each task needs its own branch+PR so the dev team sees granular progress.\n" +
          "Bundling work on the feature branch makes individual changes invisible.\n" +
          "FIX: git checkout -b " + branch.split("-")[0] + "-T<NNN>-<slug>\n" +
          "Command: " + cmd.substring(0, 80)
      };
    }

    // --- Block gh pr merge unless completion test is mentioned ---
    if (/gh\s+pr\s+merge/.test(cmd)) {
      var taskMatch = branch.match(/T(\d{3})/);
      if (!taskMatch) return null;
      var taskNum = "T" + taskMatch[1];

      var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      var specsDir = path.join(projectDir, "specs");
      if (!fs.existsSync(specsDir)) return null;

      try {
        var specDirs = fs.readdirSync(specsDir);
        for (var si = 0; si < specDirs.length; si++) {
          var tf = path.join(specsDir, specDirs[si], "tasks.md");
          if (!fs.existsSync(tf)) continue;
          var content = fs.readFileSync(tf, "utf-8");
          if (content.indexOf(taskNum) === -1) continue;

          var phases = content.split(/^## Phase/m);
          for (var p = 1; p < phases.length; p++) {
            if (phases[p].indexOf(taskNum) === -1) continue;
            var cpMatch = phases[p].match(/\*\*Checkpoint\*\*:?([\s\S]*?)(?=\n---|\n## |$)/);
            if (cpMatch) {
              var scriptMatch = cpMatch[1].match(/bash\s+(scripts\/test\/[^\s`]+)/);
              if (scriptMatch) {
                // Check if test was already run and passed (marker file)
                var markerDir = path.join(projectDir, ".test-results");
                var markerFile = path.join(markerDir, taskNum + ".passed");
                if (fs.existsSync(markerFile)) {
                  // Test passed — allow merge
                  return null;
                }
                return {
                  decision: "block",
                  reason: "PR MERGE GATE: Run completion test before merging " + taskNum + ":\n" +
                    "WHY: Every PR must prove it works before merge. Merged PRs must be validated.\n" +
                    "No manual verification — automated tests are the only proof.\n" +
                    "FIX: bash " + scriptMatch[1] + "\n" +
                    "Then merge. (Results tracked in .test-results/" + taskNum + ".passed)"
                };
              }
            }
            break;
          }
        }
      } catch(e) {}
    }

    return null;
  }

  return null;
};
