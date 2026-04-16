// TOOLS: Bash, Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Claude makes 20+ file changes without committing, then context resets
// and all work is lost or untraceable. User tracks progress via GitHub Mobile.
// Every 15 edits, force a commit so there's a git trail.
// T459: Raised from 5→15. 5 interrupted mid-feature (config+code+test+docs = 5 files).
// 15 gives room for a coherent change while still catching runaway sessions.
// T466: Added branch-file mismatch detection + worktree enforcement.
// Incident: Claude committed dd-lab files to branch 001-T001-deploy-nfs-datasec-v2
// because the gate just said "commit now" without checking branch fitness.
// Now: detects mismatch → tells Claude to use EnterWorktree instead of committing
// to the wrong branch. Also enforces worktrees over bare branch checkouts.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");

var COUNTER_FILE = path.join(os.homedir(), ".claude", "hooks", ".uncommitted-edit-count");
var MAX_EDITS = 15;

// Patterns indicating file-modifying Bash commands (shared helper — DRY with spec-before-code-gate)
var FILE_MODIFY_PATTERNS = require("./_file-modify-patterns");

function readCounter() {
  try {
    var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
    return data.count || 0;
  } catch(e) { return 0; }
}

function writeCounter(count) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: count, ts: new Date().toISOString() }));
  } catch(e) {}
}

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function getGitDiffCount() {
  try {
    var opts = { encoding: "utf-8", timeout: 5000, windowsHide: true, cwd: getProjectDir() };
    var out = cp.execFileSync("git", ["diff", "--stat"], opts).trim();
    if (!out) return 0;
    var lines = out.split("\n");
    // Last line is summary like "3 files changed, ..."
    var summary = lines[lines.length - 1];
    var match = summary.match(/(\d+)\s+file/);
    return match ? parseInt(match[1], 10) : 0;
  } catch(e) { return 0; }
}

// Get changed file paths (tracked modifications + untracked new files)
function getChangedFiles() {
  try {
    var opts = { encoding: "utf-8", timeout: 5000, windowsHide: true, cwd: getProjectDir() };
    var modified = cp.execFileSync("git", ["diff", "--name-only"], opts).trim();
    var staged = cp.execFileSync("git", ["diff", "--name-only", "--cached"], opts).trim();
    var untracked = cp.execFileSync("git", ["ls-files", "--others", "--exclude-standard"], opts).trim();
    var all = (modified + "\n" + staged + "\n" + untracked).split("\n").filter(function(f) { return f.length > 0; });
    // Deduplicate
    var seen = {};
    return all.filter(function(f) { if (seen[f]) return false; seen[f] = true; return true; });
  } catch(e) { return []; }
}

// Get current branch name
function getBranch(input) {
  if (input && input._git && input._git.branch) return input._git.branch;
  try {
    var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
    var gitPath = path.join(projectDir, ".git");
    // In worktrees .git is a file pointing to the real git dir
    var gitStat = fs.statSync(gitPath);
    var headFile;
    if (gitStat.isFile()) {
      // Worktree: .git is a file like "gitdir: /path/to/.git/worktrees/name"
      var gitdir = fs.readFileSync(gitPath, "utf-8").trim().replace(/^gitdir:\s*/, "");
      headFile = path.join(gitdir, "HEAD");
    } else {
      headFile = path.join(gitPath, "HEAD");
    }
    var head = fs.readFileSync(headFile, "utf-8").trim();
    if (head.indexOf("ref: refs/heads/") === 0) return head.slice(16);
    return "";
  } catch(e) { return ""; }
}

// Check if we're in a worktree (vs main checkout)
function isInWorktree() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  try {
    var gitPath = path.join(projectDir, ".git");
    return fs.statSync(gitPath).isFile(); // .git file = worktree, .git dir = main checkout
  } catch(e) { return false; }
}

// Extract meaningful keywords from a branch name
// "001-T001-deploy-nfs-datasec-v2" → ["deploy", "nfs", "datasec"]
function branchKeywords(branch) {
  return branch.toLowerCase()
    .split(/[-_\/]/)
    .filter(function(w) {
      if (!w || w.length < 2) return false;
      if (/^\d+$/.test(w)) return false;       // pure numbers
      if (/^t\d+$/i.test(w)) return false;     // task refs (T001)
      if (/^v\d+$/i.test(w)) return false;     // version refs (v2)
      if (/^(main|master|phase|feature|worktree)$/.test(w)) return false;
      return true;
    });
}

// Extract directory segments from changed file paths
// "labs/dd-lab/terraform/main.tf" → ["labs", "dd-lab", "terraform"]
function fileKeywords(files) {
  var dirs = {};
  files.forEach(function(f) {
    var parts = f.replace(/\\/g, "/").split("/");
    // Keep directory segments AND filename stem (without extension)
    for (var i = 0; i < parts.length; i++) {
      var seg = (i < parts.length - 1) ? parts[i] : parts[i].replace(/\.[^.]+$/, "");
      seg = seg.toLowerCase();
      if (seg && seg.length >= 2 && !/^\d+$/.test(seg)) {
        dirs[seg] = true;
      }
    }
  });
  return Object.keys(dirs);
}

// Check if branch keywords overlap with file directory keywords
function checkBranchFileMismatch(branch, files) {
  if (!branch || branch === "main" || branch === "master") return null;
  if (files.length === 0) return null;

  var bKeys = branchKeywords(branch);
  var fKeys = fileKeywords(files);

  if (bKeys.length === 0 || fKeys.length === 0) return null; // can't determine

  // Check for any overlap (substring matching for compound words)
  for (var b = 0; b < bKeys.length; b++) {
    for (var f = 0; f < fKeys.length; f++) {
      if (bKeys[b] === fKeys[f]) return null;
      if (bKeys[b].indexOf(fKeys[f]) !== -1 || fKeys[f].indexOf(bKeys[b]) !== -1) return null;
    }
  }

  // No overlap — mismatch
  return {
    branchKeywords: bKeys,
    fileKeywords: fKeys
  };
}

module.exports = function(input) {
  var cmd = "";
  if (input.tool_name === "Bash") {
    try {
      cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
    } catch(e) { cmd = (input.tool_input || {}).command || ""; }
  }

  // Reset counter on git commit
  if (input.tool_name === "Bash" && /git\s+commit/.test(cmd)) {
    writeCounter(0);
    return null;
  }

  // Increment counter on file modifications
  var isFileModify = false;
  if (input.tool_name === "Edit" || input.tool_name === "Write") {
    isFileModify = true;
  } else if (input.tool_name === "Bash") {
    for (var i = 0; i < FILE_MODIFY_PATTERNS.length; i++) {
      if (FILE_MODIFY_PATTERNS[i].test(cmd)) {
        isFileModify = true;
        break;
      }
    }
  }

  if (!isFileModify) return null;

  var count = readCounter() + 1;
  writeCounter(count);

  if (count >= MAX_EDITS) {
    // Cross-check with actual git diff
    var gitCount = getGitDiffCount();
    if (gitCount === 0) {
      // Counter drifted (files were reverted) — reset
      writeCounter(0);
      return null;
    }

    var branch = getBranch(input);
    var files = getChangedFiles();
    var inWorktree = isInWorktree();

    // Check for branch-file mismatch
    var mismatch = checkBranchFileMismatch(branch, files);

    if (mismatch) {
      // WRONG BRANCH — changed files don't relate to this branch at all
      var topDirs = [];
      var seen = {};
      files.forEach(function(f) {
        var top = f.replace(/\\/g, "/").split("/")[0];
        if (!seen[top]) { seen[top] = true; topDirs.push(top); }
      });
      return {
        decision: "block",
        reason: "COMMIT COUNTER — WRONG BRANCH: " + count + " edits, but files don't belong to this branch.\n" +
          "Branch: " + branch + " (keywords: " + mismatch.branchKeywords.join(", ") + ")\n" +
          "Changed files are in: " + topDirs.join(", ") + " (keywords: " + mismatch.fileKeywords.join(", ") + ")\n\n" +
          "DO NOT commit to this branch. These files belong to a different workstream.\n" +
          "REQUIRED: Call EnterWorktree to create an isolated worktree for this work.\n" +
          "EnterWorktree gives you a clean branch in a separate directory — no conflicts."
      };
    }

    // Branch looks right (or we can't tell) but not in a worktree — enforce worktree
    if (!inWorktree) {
      return {
        decision: "block",
        reason: "COMMIT COUNTER: " + count + " file modifications since last commit (" + gitCount + " files changed in git).\n" +
          "You are in the main checkout, not a worktree.\n" +
          "REQUIRED: Call EnterWorktree to create an isolated worktree, then commit there.\n" +
          "Worktrees prevent file conflicts with other simultaneous sessions."
      };
    }

    // In a worktree, branch looks right — standard commit guidance
    return {
      decision: "block",
      reason: "COMMIT COUNTER: " + count + " file modifications since last commit (" + gitCount + " files changed in git).\n" +
        "Commit now with a descriptive message before continuing.\n" +
        "Run: git add <files> && git commit -m 'describe what changed and why'"
    };
  }

  return null;
};
