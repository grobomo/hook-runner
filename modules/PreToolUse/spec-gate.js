// WORKFLOW: shtd
// WHY: Claude implemented features that nobody asked for, wasting hours.
// The old gate only checked "any unchecked task exists" — it didn't enforce
// the spec→tasks→code sequence. This rewrite enforces the full SHTD chain.
"use strict";
// requires: enforcement-gate
// Spec gate: enforces spec → tasks → code pipeline.
// 1. Code edits require a spec (specs/<feature>/spec.md) to exist
// 2. That spec must have tasks (specs/<feature>/tasks.md) with unchecked items
// 3. Feature is matched by git branch name or falls back to any spec with open tasks
// Allows: config, specs, planning, rules, hooks, TODO.md, SESSION_STATE.md, test files
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

// T079: Auto-activate SHTD workflow state when shtd is enabled but no state exists
function autoActivateShtd(projectDir) {
  try {
    var wfPath = path.join(path.dirname(__dirname), "..", "workflow.js");
    if (!fs.existsSync(wfPath)) return;
    var wf = require(wfPath);
    if (!wf.isWorkflowEnabled("shtd", path.join(
      (process.env.HOME || process.env.USERPROFILE || ""), ".claude", "hooks"
    ))) return;
    // Already has state? Skip
    if (wf.readState(projectDir)) return;
    // Find the shtd workflow YAML
    var workflows = wf.findWorkflows(projectDir);
    for (var i = 0; i < workflows.length; i++) {
      if (workflows[i].name === "shtd") {
        wf.initState("shtd", workflows[i]._path, projectDir);
        break;
      }
    }
  } catch (e) { /* best effort */ }
}

function getGitBranch(gitRoot) {
  try {
    return cp.execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: gitRoot, encoding: "utf-8", timeout: 3000
    }).trim();
  } catch (e) { return ""; }
}

// Extract feature keywords from branch name
// e.g. "002-T007-validate-self-analysis" → ["validate", "self", "analysis"]
// e.g. "fix/shtd-enforcement" → ["shtd", "enforcement"]
function branchFeatureWords(branch) {
  if (!branch || branch === "main" || branch === "master" || branch === "HEAD") return [];
  // Strip common prefixes and task IDs
  var cleaned = branch.replace(/^(feat|fix|chore|refactor|docs|test)[\/\-]/i, "")
    .replace(/^\d+-T\d+-/i, "")
    .replace(/^T\d+-/i, "");
  return cleaned.split(/[-_\/]/).filter(function(w) { return w.length > 2; }).map(function(w) { return w.toLowerCase(); });
}

// Score how well a spec dir name matches branch feature words
function matchScore(specDirName, featureWords) {
  if (featureWords.length === 0) return 0;
  var dirWords = specDirName.toLowerCase().split(/[-_]/).filter(function(w) { return w.length > 2; });
  var score = 0;
  for (var i = 0; i < featureWords.length; i++) {
    for (var j = 0; j < dirWords.length; j++) {
      if (dirWords[j].indexOf(featureWords[i]) !== -1 || featureWords[i].indexOf(dirWords[j]) !== -1) {
        score++;
        break;
      }
    }
  }
  return score;
}

function findGitRoot(startDir) {
  var dir = startDir;
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir.replace(/\\/g, "/");
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var targetFile = "";
  try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
  if (!targetFile) return null;
  var norm = targetFile.replace(/\\/g, "/");

  // Allow bootstrap/config/planning files on any branch
  // T080: Tightened — removed scripts/test/ blanket bypass and .json catch-all
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
    /\.github\//, /\/hooks\//, /\/rules\//,
    /\.gitignore$/,
    // Specific config files only (not all .json)
    /package\.json$/, /package-lock\.json$/, /tsconfig[^/]*\.json$/,
    /\.eslintrc/, /\.prettierrc/, /jest\.config/, /vitest\.config/,
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(norm)) return null;
  }

  // Allow test files — but only if at least one spec+tasks combo exists anywhere
  // (prevents "write tests" from bypassing the need for a spec entirely)
  var isTestFile = /[\/\\]tests?[\/\\]|scripts\/test\/|\.test\.[jt]s$|\.spec\.[jt]s$|_test\.py$|test_.*\.py$/.test(norm);

  // Allow user home config
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  if (home && norm.indexOf(home + "/.claude/") === 0) return null;

  // Find project root(s)
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var roots = [];
  if (projectDir) roots.push(projectDir);

  var fileGitRoot = findGitRoot(path.dirname(targetFile));
  if (fileGitRoot && roots.indexOf(fileGitRoot) === -1) roots.push(fileGitRoot);
  if (roots.length === 0) return null;

  // T079: Auto-activate SHTD workflow state
  for (var ai = 0; ai < roots.length; ai++) {
    autoActivateShtd(roots[ai]);
  }

  // Get current branch for feature matching (prefer shared context from runner)
  var branch = (input._git && input._git.branch) || "";
  if (!branch) {
    for (var bi = 0; bi < roots.length; bi++) {
      branch = getGitBranch(roots[bi]);
      if (branch) break;
    }
  }
  var featureWords = branchFeatureWords(branch);

  // Scan all spec directories across roots
  // Collect: { dir, hasSpec, hasTasks, hasUnchecked, matchScore }
  var specEntries = [];
  for (var ri = 0; ri < roots.length; ri++) {
    var specsDir = path.join(roots[ri], "specs");
    if (!fs.existsSync(specsDir)) continue;
    try {
      var specDirs = fs.readdirSync(specsDir);
      for (var j = 0; j < specDirs.length; j++) {
        var specBase = path.join(specsDir, specDirs[j]);
        if (!fs.statSync(specBase).isDirectory()) continue;
        var hasSpec = fs.existsSync(path.join(specBase, "spec.md"));
        var tasksPath = path.join(specBase, "tasks.md");
        var hasTasks = fs.existsSync(tasksPath);
        var hasUnchecked = false;
        if (hasTasks) {
          try {
            var content = fs.readFileSync(tasksPath, "utf-8");
            hasUnchecked = /- \[ \] T\d+/.test(content);
          } catch (e) {}
        }
        specEntries.push({
          dir: specDirs[j],
          hasSpec: hasSpec,
          hasTasks: hasTasks,
          hasUnchecked: hasUnchecked,
          score: matchScore(specDirs[j], featureWords),
        });
      }
    } catch (e) {}
  }

  // Also check TODO.md as a fallback task source (for simpler projects)
  var hasTodoUnchecked = false;
  for (var ti = 0; ti < roots.length; ti++) {
    var todoPath = path.join(roots[ti], "TODO.md");
    if (!fs.existsSync(todoPath)) continue;
    try {
      var todoContent = fs.readFileSync(todoPath, "utf-8");
      if (/- \[ \] T\d+/.test(todoContent)) {
        hasTodoUnchecked = true;
        break;
      }
    } catch (e) {}
  }

  // --- Enforcement logic ---

  // No specs at all and no TODO.md tasks — block
  if (specEntries.length === 0 && !hasTodoUnchecked) {
    return {
      decision: "block",
      reason: "SPEC GATE: No specs/ with tasks.md or TODO.md found.\n" +
        "WHY: Every change must be specced so the dev team can see what you're doing\n" +
        "and why via GitHub PRs. Unspecced work is invisible — nobody can review it,\n" +
        "understand the intent, or track progress. Specs ARE the project history.\n" +
        "FIX:\n" +
        "  1. /speckit.specify — define what and why\n" +
        "  2. /speckit.plan — design the approach\n" +
        "  3. /speckit.tasks — generate trackable tasks\n" +
        "  OR: Add `- [ ] TXXX: description` entries to TODO.md\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  // If branch matches a spec dir, enforce THAT spec's chain specifically
  if (featureWords.length > 0 && specEntries.length > 0) {
    // Find best matching spec
    var bestMatch = null;
    var bestScore = 0;
    for (var si = 0; si < specEntries.length; si++) {
      if (specEntries[si].score > bestScore) {
        bestScore = specEntries[si].score;
        bestMatch = specEntries[si];
      }
    }

    if (bestMatch && bestScore >= 1) {
      // Matched a spec dir to the branch — enforce its full chain
      if (!bestMatch.hasSpec) {
        return {
          decision: "block",
          reason: "SPEC GATE: specs/" + bestMatch.dir + "/spec.md missing.\n" +
            "WHY: The SHTD pipeline requires spec FIRST, then tasks, then code.\n" +
            "Your branch '" + branch + "' matches specs/" + bestMatch.dir + "/ but spec.md doesn't exist.\n" +
            "FIX: Create specs/" + bestMatch.dir + "/spec.md with /speckit.specify\n" +
            "Blocked: " + path.basename(targetFile)
        };
      }
      if (!bestMatch.hasTasks) {
        return {
          decision: "block",
          reason: "SPEC GATE: specs/" + bestMatch.dir + "/tasks.md missing.\n" +
            "WHY: Spec exists but no tasks. The SHTD pipeline is: spec → tasks → code.\n" +
            "FIX: Create tasks with /speckit.tasks from specs/" + bestMatch.dir + "/spec.md\n" +
            "Blocked: " + path.basename(targetFile)
        };
      }
      if (!bestMatch.hasUnchecked) {
        return {
          decision: "block",
          reason: "SPEC GATE: All tasks in specs/" + bestMatch.dir + "/tasks.md are checked off.\n" +
            "WHY: No open tasks remain for this feature. Either add new tasks or start a new spec.\n" +
            "FIX: Add unchecked tasks to specs/" + bestMatch.dir + "/tasks.md or TODO.md\n" +
            "Blocked: " + path.basename(targetFile)
        };
      }

      // Test files allowed if the matched spec has the full chain
      if (isTestFile) return null;

      return null; // Full chain satisfied for matched spec
    }
  }

  // No branch match — fall back to checking ANY spec has the full chain,
  // or TODO.md has unchecked tasks
  var anyFullChain = false;
  var chainStatus = { noSpec: [], noTasks: [], noUnchecked: [] };
  for (var ci = 0; ci < specEntries.length; ci++) {
    var e = specEntries[ci];
    if (!e.hasSpec) { chainStatus.noSpec.push(e.dir); continue; }
    if (!e.hasTasks) { chainStatus.noTasks.push(e.dir); continue; }
    if (!e.hasUnchecked) { chainStatus.noUnchecked.push(e.dir); continue; }
    anyFullChain = true;
  }

  // TODO.md with unchecked tasks counts as a valid chain
  if (hasTodoUnchecked) anyFullChain = true;

  if (isTestFile && anyFullChain) return null;

  if (!anyFullChain) {
    // Build diagnostic message
    var diag = [];
    if (chainStatus.noSpec.length > 0) diag.push("Missing spec.md: " + chainStatus.noSpec.join(", "));
    if (chainStatus.noTasks.length > 0) diag.push("Missing tasks.md: " + chainStatus.noTasks.join(", "));
    if (chainStatus.noUnchecked.length > 0) diag.push("All tasks done: " + chainStatus.noUnchecked.join(", "));
    return {
      decision: "block",
      reason: "SPEC GATE: No spec has a complete SHTD chain (spec.md → tasks.md → unchecked tasks).\n" +
        (diag.length > 0 ? diag.join("\n") + "\n" : "") +
        "WHY: Every change must map to a spec task so the dev team can track progress\n" +
        "through PRs. Undocumented work is invisible and can't be reviewed or monitored.\n" +
        "FIX: Complete the chain: /speckit.specify → /speckit.plan → /speckit.tasks\n" +
        "  OR: Add `- [ ] TXXX: description` entries to TODO.md\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  return null;
};
