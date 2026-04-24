#!/usr/bin/env bash
# Test T477: run-pretooluse.js reads branch from worktree CWD, not just CLAUDE_PROJECT_DIR
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: runner worktree branch detection (T477) ==="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Create a "main" repo on branch main
MAIN_REPO="$TMPDIR/main-repo"
mkdir -p "$MAIN_REPO"
git init -q -b main "$MAIN_REPO"
(cd "$MAIN_REPO" && git config user.email "test@test" && git config user.name "test")
echo "x" > "$MAIN_REPO/file.txt"
(cd "$MAIN_REPO" && git add -A && git commit -q -m "init" 2>/dev/null) || true

# Create a worktree on a feature branch
WORKTREE="$MAIN_REPO/.claude/worktrees/T477-test"
(cd "$MAIN_REPO" && git worktree add -q -b worktree-T477-test "$WORKTREE" 2>/dev/null) || true

# Inline the readBranchFromDir logic (same as run-pretooluse.js)
READ_BRANCH_JS='
  var fs = require("fs");
  var path = require("path");
  function readBranchFromDir(dir) {
    var dotGit = path.join(dir, ".git");
    var headPath;
    try {
      var stat = fs.statSync(dotGit);
      if (stat.isFile()) {
        var gitdir = fs.readFileSync(dotGit, "utf-8").trim().replace(/^gitdir:\s*/, "");
        if (!path.isAbsolute(gitdir)) gitdir = path.join(dir, gitdir);
        headPath = path.join(gitdir, "HEAD");
      } else {
        headPath = path.join(dotGit, "HEAD");
      }
    } catch (e) { return ""; }
    try {
      var head = fs.readFileSync(headPath, "utf-8").trim();
      return head.indexOf("ref: refs/heads/") === 0 ? head.slice(16) : "";
    } catch (e) { return ""; }
  }
  var projectDir = process.env.CLAUDE_PROJECT_DIR.replace(/\\\\/g, "/");
  var cwd = process.cwd().replace(/\\\\/g, "/");
  var branch = "";
  if (cwd !== projectDir) branch = readBranchFromDir(cwd);
  if (!branch) branch = readBranchFromDir(projectDir);
  process.stdout.write(branch);
'

# --- Test 1: Worktree CWD branch detected over main ---
BRANCH=$(cd "$WORKTREE" && CLAUDE_PROJECT_DIR="$MAIN_REPO" node -e "$READ_BRANCH_JS" 2>/dev/null)
if [ "$BRANCH" = "worktree-T477-test" ]; then
  pass "worktree CWD branch detected: $BRANCH"
else
  fail "expected worktree-T477-test, got: $BRANCH"
fi

# --- Test 2: Falls back to main when CWD = projectDir ---
BRANCH=$(cd "$MAIN_REPO" && CLAUDE_PROJECT_DIR="$MAIN_REPO" node -e "$READ_BRANCH_JS" 2>/dev/null)
if [ "$BRANCH" = "main" ]; then
  pass "falls back to main when CWD = projectDir: $BRANCH"
else
  fail "expected main, got: $BRANCH"
fi

# --- Test 3: Non-git CWD falls back to projectDir ---
BRANCH=$(cd "$TMPDIR" && CLAUDE_PROJECT_DIR="$MAIN_REPO" node -e "$READ_BRANCH_JS" 2>/dev/null)
if [ "$BRANCH" = "main" ]; then
  pass "non-git CWD falls back to projectDir: $BRANCH"
else
  fail "expected main, got: $BRANCH"
fi

# --- Test 4: Worktree .git is a file (not directory) ---
if [ -f "$WORKTREE/.git" ]; then
  pass "worktree .git is a file (not directory)"
else
  fail "worktree .git should be a file"
fi

# --- Test 5: Main repo .git is a directory ---
if [ -d "$MAIN_REPO/.git" ]; then
  pass "main repo .git is a directory"
else
  fail "main repo .git should be a directory"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
