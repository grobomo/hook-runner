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
// T547: Fix worktree detection — walk up directory tree from CWD and CLAUDE_PROJECT_DIR
// instead of only checking immediate .git. EnterWorktree puts CWD inside a worktree
// subdirectory but CLAUDE_PROJECT_DIR stays at the main checkout.
// T547: Block state file tampering — Claude used `node -e` to reset the counter file
// directly, bypassing the gate. Now uses HMAC integrity check + Bash command detection.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");
var crypto = require("crypto");

var COUNTER_FILE = path.join(os.homedir(), ".claude", "hooks", ".uncommitted-edit-count");
var MAX_EDITS = 15;
// HMAC key derived from machine-specific data (not a secret — just prevents casual resets)
var HMAC_KEY = "ccg:" + os.hostname() + ":" + os.homedir();

// Patterns indicating file-modifying Bash commands (shared helper — DRY with spec-before-code-gate)
var FILE_MODIFY_PATTERNS = require("./_file-modify-patterns");

// State file names that are protected from Bash tampering
var PROTECTED_STATE_FILES = [
  "uncommitted-edit-count",
  "spec-before-code-state",
  "commit-counter-state"
];

function computeHmac(data) {
  return crypto.createHmac("sha256", HMAC_KEY)
    .update(JSON.stringify({ count: data.count, worktreeRequired: !!data.worktreeRequired }))
    .digest("hex").slice(0, 16);
}

function readCounter() {
  try {
    var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
    // Legacy file without HMAC — trust it but upgrade on next write
    if (!data.hmac) {
      return { count: data.count || 0, worktreeRequired: !!data.worktreeRequired, tampered: false };
    }
    var expected = computeHmac(data);
    if (data.hmac !== expected) {
      // HMAC mismatch — file was tampered with externally
      return { count: data.count || 0, worktreeRequired: !!data.worktreeRequired, tampered: true };
    }
    return { count: data.count || 0, worktreeRequired: !!data.worktreeRequired, tampered: false };
  } catch(e) { return { count: 0, worktreeRequired: false, tampered: false }; }
}

function writeCounter(count, worktreeRequired) {
  try {
    var data = {
      count: count,
      ts: new Date().toISOString(),
      worktreeRequired: !!worktreeRequired
    };
    data.hmac = computeHmac(data);
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(data));
  } catch(e) {}
}

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// T478: Combined into single `git status --porcelain` call (was 4 separate git spawns).
// Returns { files: string[], diffCount: number }.
function getGitStatus() {
  try {
    var opts = { encoding: "utf-8", timeout: 5000, windowsHide: true, cwd: getProjectDir() };
    var out = cp.execFileSync("git", ["status", "--porcelain"], opts).trim();
    if (!out) return { files: [], diffCount: 0 };
    var lines = out.split("\n");
    var seen = {};
    var files = [];
    for (var i = 0; i < lines.length; i++) {
      // porcelain format: XY filename (or XY old -> new for renames)
      var f = lines[i].slice(3).trim().replace(/.* -> /, "");
      if (f && !seen[f]) { seen[f] = true; files.push(f); }
    }
    return { files: files, diffCount: files.length };
  } catch(e) { return { files: [], diffCount: 0 }; }
}

// Get current branch name
// T511: Check CLAUDE_PROJECT_DIR first, fall back to CWD when no .git at project dir.
function getBranch(input) {
  if (input && input._git && input._git.branch) return input._git.branch;
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  var dirs = projectDir ? [projectDir, process.cwd()] : [process.cwd()];
  for (var d = 0; d < dirs.length; d++) {
    try {
      var gitPath = path.join(dirs[d], ".git");
      var gitStat = fs.statSync(gitPath);
      var headFile;
      if (gitStat.isFile()) {
        var gitdir = fs.readFileSync(gitPath, "utf-8").trim().replace(/^gitdir:\s*/, "");
        headFile = path.join(gitdir, "HEAD");
      } else {
        headFile = path.join(gitPath, "HEAD");
      }
      var head = fs.readFileSync(headFile, "utf-8").trim();
      if (head.indexOf("ref: refs/heads/") === 0) return head.slice(16);
    } catch(e) { /* try next dir */ }
  }
  return "";
}

// T547: Walk up from a directory looking for .git file (worktree marker).
// Returns true if any ancestor has a .git FILE (not directory).
// Stops at filesystem root or after 20 levels to avoid infinite loops.
function findWorktreeGitFile(startDir) {
  var dir = startDir;
  for (var i = 0; i < 20; i++) {
    try {
      var gitPath = path.join(dir, ".git");
      var stat = fs.statSync(gitPath);
      if (stat.isFile()) return true;   // .git file = worktree
      if (stat.isDirectory()) return false; // .git dir = main checkout, stop walking
    } catch(e) { /* no .git here, keep walking up */ }
    var parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return false;
}

// Check if we're in a worktree (vs main checkout)
// T511: Also check CWD when CLAUDE_PROJECT_DIR has no .git — EnterWorktree
// changes CWD but not CLAUDE_PROJECT_DIR.
// T532: Also check CWD when CLAUDE_PROJECT_DIR's .git is a directory (main checkout).
// EnterWorktree changes CWD to the worktree but CLAUDE_PROJECT_DIR stays pointing at
// the main checkout. The old code returned false immediately when .git was a dir,
// never reaching the CWD check. Now: if CLAUDE_PROJECT_DIR is main, fall through to CWD.
// T547: Walk up directory tree instead of only checking immediate .git.
// EnterWorktree creates worktrees at CLAUDE_PROJECT_DIR/.claude/worktrees/<name>/
// but hook process CWD may be a subdirectory. Walking up finds the .git file.
function isInWorktree() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  // Check CLAUDE_PROJECT_DIR first (immediate check for speed)
  if (projectDir) {
    try {
      var gitPath = path.join(projectDir, ".git");
      var stat = fs.statSync(gitPath);
      if (stat.isFile()) return true; // .git file = worktree at CLAUDE_PROJECT_DIR
      // .git is a directory (main checkout) — fall through to CWD check
      // because EnterWorktree may have moved CWD to a worktree
    } catch(e) { /* no .git at CLAUDE_PROJECT_DIR — fall through to CWD */ }
  }

  // T547: Walk up from CWD looking for .git file (worktree marker).
  // Covers: CWD is inside worktree subdir, or CWD IS the worktree root.
  try {
    if (findWorktreeGitFile(process.cwd())) return true;
  } catch(e) { /* cwd inaccessible */ }

  // T547: If CWD is the main checkout but CLAUDE_PROJECT_DIR has worktrees,
  // check if `git rev-parse --git-dir` reveals a worktree.
  // This catches the case where the harness CWD hasn't moved but git operations
  // target a worktree (e.g. via `cd worktree && git commit` in a single Bash call).
  try {
    var opts = { encoding: "utf-8", timeout: 3000, windowsHide: true };
    var gitDir = cp.execFileSync("git", ["rev-parse", "--git-dir"], opts).trim();
    // In a worktree, --git-dir returns the .git/worktrees/<name> path
    if (/[\/\\]\.git[\/\\]worktrees[\/\\]/.test(gitDir)) return true;
  } catch(e) { /* not in a git repo or git not available */ }

  return false;
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

// T497: Metadata directories that change regardless of branch — exclude from mismatch detection.
// Incident: .claude/ and .coconut/ files triggered "WRONG BRANCH" in worktrees because
// these directories never match branch keywords like "audit", "deploy", etc.
// T497: Include both dotted and undotted variants because git status --porcelain
// prefix length varies (` M ` vs `M `), and slice(3) can clip the leading dot.
var METADATA_DIRS = {
  ".claude": true, "claude": true,
  ".coconut": true, "coconut": true,
  ".git": true, ".github": true, "github": true,
  ".planning": true, "planning": true,
  ".specify": true, "specify": true,
  ".vscode": true, "vscode": true,
  "node_modules": true, "specs": true,
};

// Extract directory segments from changed file paths (NOT filename stems —
// filenames like deploy.sh, main.tf, config.json are too generic and cause false matches)
// "labs/dd-lab/terraform/main.tf" → ["labs", "dd-lab", "terraform"]
// T497: Skip entire file if top-level dir is metadata (e.g. .claude/worktrees/foo/bar.js → skip all)
function fileKeywords(files) {
  var dirs = {};
  files.forEach(function(f) {
    var parts = f.replace(/\\/g, "/").split("/");
    // Skip files rooted in metadata directories
    if (parts.length > 0 && METADATA_DIRS[parts[0].toLowerCase()]) return;
    // Only directory segments, skip the filename
    for (var i = 0; i < parts.length - 1; i++) {
      var seg = parts[i].toLowerCase();
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

// T547: Detect Bash commands that tamper with gate state files.
// Incident: Claude used `node -e "fs.writeFileSync(...uncommitted-edit-count...)"` to
// reset the counter to 0, bypassing the worktreeRequired gate entirely.
function detectStateTampering(cmd) {
  if (!cmd) return false;
  for (var i = 0; i < PROTECTED_STATE_FILES.length; i++) {
    if (cmd.indexOf(PROTECTED_STATE_FILES[i]) !== -1) return true;
  }
  return false;
}

module.exports = function(input) {
  var cmd = "";
  if (input.tool_name === "Bash") {
    try {
      cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
    } catch(e) { cmd = (input.tool_input || {}).command || ""; }
  }

  // T547: Block Bash commands that tamper with gate state files
  // Skip git commit/log/diff — commit messages and diffs may legitimately mention state file names
  if (input.tool_name === "Bash" && !(/git\s+(commit|log|diff|show|grep)/.test(cmd)) && detectStateTampering(cmd)) {
    return {
      decision: "block",
      reason: "COMMIT COUNTER — STATE TAMPERING BLOCKED: This command references a gate state file.\n" +
        "WHY: Claude previously used `node -e` to reset the counter file directly,\n" +
        "bypassing worktree enforcement entirely.\n\n" +
        "Gate state files are managed exclusively by hook modules.\n" +
        "To clear the worktreeRequired flag: call EnterWorktree, then commit in the worktree."
    };
  }

  // Reset counter on git commit — but block if worktree was required
  // T485: Previously, Claude bypassed the worktree enforcement by just committing
  // on the wrong branch. Now: if the gate flagged "worktree required", block commits too.
  if (input.tool_name === "Bash" && /git\s+commit/.test(cmd)) {
    var state = readCounter();
    // T547: If HMAC check failed, the counter was tampered with — restore worktreeRequired
    if (state.tampered) {
      writeCounter(state.count, true); // re-sign with correct HMAC, keep worktreeRequired
      return {
        decision: "block",
        reason: "COMMIT COUNTER — INTEGRITY VIOLATION: The counter state file was modified outside this gate.\n" +
          "The worktreeRequired flag has been restored.\n" +
          "REQUIRED: Call EnterWorktree first, then commit in the worktree."
      };
    }
    if (state.worktreeRequired && !isInWorktree()) {
      return {
        decision: "block",
        reason: "COMMIT COUNTER — WORKTREE REQUIRED: Cannot commit on the main checkout.\n" +
          "A previous check found files that need an isolated worktree.\n" +
          "REQUIRED: Call EnterWorktree first, then commit in the worktree.\n" +
          "This flag clears automatically once you're in a worktree."
      };
    }
    writeCounter(0, false);
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

  var counterState = readCounter();
  // T547: If tampering detected on read, restore with correct HMAC
  if (counterState.tampered) {
    writeCounter(counterState.count, true);
    return {
      decision: "block",
      reason: "COMMIT COUNTER — INTEGRITY VIOLATION: The counter state file was modified outside this gate.\n" +
        "Counter and worktreeRequired flag have been restored. Retry your edit."
    };
  }
  var count = counterState.count + 1;
  writeCounter(count, counterState.worktreeRequired);

  if (count >= MAX_EDITS) {
    // T478: Single git call replaces 4 separate spawns
    var status = getGitStatus();
    var gitCount = status.diffCount;
    if (gitCount === 0) {
      // Counter drifted (files were reverted) — reset
      writeCounter(0);
      return null;
    }

    var branch = getBranch(input);
    var files = status.files;
    var inWorktree = isInWorktree();

    // Check for branch-file mismatch
    var mismatch = checkBranchFileMismatch(branch, files);

    if (mismatch && !inWorktree) {
      // WRONG BRANCH — changed files don't relate to this branch at all
      // T485: Set worktreeRequired flag so git commit is also blocked
      // T540: Only enforce on main checkout. In worktrees, mismatch is advisory —
      // you're already isolated and can't EnterWorktree from within a worktree.
      writeCounter(count, true);
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
      // T485: Set worktreeRequired flag so git commit is also blocked
      writeCounter(count, true);
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
