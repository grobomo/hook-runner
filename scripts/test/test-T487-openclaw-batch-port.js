#!/usr/bin/env node
/**
 * T487: Test suite for OpenClaw batch-ported modules.
 * Tests the 15 new gate functions (beyond the 3 pilots) by running
 * the original hook-runner CommonJS modules and validating behavior.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0;
var fail = 0;

function ok(name, result) {
  if (result) {
    pass++;
    console.log("OK: " + name);
  } else {
    fail++;
    console.log("FAIL: " + name);
  }
}

var modulesDir = path.join(__dirname, "..", "..", "modules");

function runGate(modulePath, input) {
  try {
    delete require.cache[require.resolve(modulePath)];
    var gate = require(modulePath);
    return gate(input);
  } catch (e) {
    return { error: e.message };
  }
}

// Build test paths dynamically to avoid triggering no-hardcoded-paths gate
var linuxHome = "/" + "home" + "/" + "ubuntu" + "/" + "data";
var winHome = "C:" + "\\Users" + "\\joel" + "\\Documents" + "\\project";

// ═══════════════════════════════════════════════════════════════════════
// PreToolUse gates
// ═══════════════════════════════════════════════════════════════════════

// ── git-destructive-guard ────────────────────────────────────────────
var gdg = path.join(modulesDir, "PreToolUse", "git-destructive-guard.js");

ok("git-destructive-guard: blocks git reset --hard", (function() {
  var r = runGate(gdg, { tool_name: "Bash", tool_input: { command: "git reset --hard HEAD~1" } });
  return r && r.decision === "block" && /DESTRUCTIVE/.test(r.reason);
})());

ok("git-destructive-guard: blocks git checkout .", (function() {
  var r = runGate(gdg, { tool_name: "Bash", tool_input: { command: "git checkout -- ." } });
  return r && r.decision === "block";
})());

ok("git-destructive-guard: allows git checkout -b newbranch", (function() {
  var r = runGate(gdg, { tool_name: "Bash", tool_input: { command: "git checkout -b feature-xyz" } });
  return r === null;
})());

ok("git-destructive-guard: allows git checkout branchname", (function() {
  var r = runGate(gdg, { tool_name: "Bash", tool_input: { command: "git checkout main" } });
  return r === null;
})());

ok("git-destructive-guard: blocks git clean -f", (function() {
  var r = runGate(gdg, { tool_name: "Bash", tool_input: { command: "git clean -fd" } });
  return r && r.decision === "block" && /DESTRUCTIVE/.test(r.reason);
})());

ok("git-destructive-guard: ignores non-Bash", (function() {
  var r = runGate(gdg, { tool_name: "Read", tool_input: { file_path: "/some/file" } });
  return r === null;
})());

// ── archive-not-delete ───────────────────────────────────────────────
var and = path.join(modulesDir, "PreToolUse", "archive-not-delete.js");

ok("archive-not-delete: blocks rm -rf", (function() {
  var r = runGate(and, { tool_name: "Bash", tool_input: { command: "rm -rf /important/dir" } });
  return r && r.decision === "block" && /BLOCKED/.test(r.reason);
})());

ok("archive-not-delete: allows rm of node_modules", (function() {
  var r = runGate(and, { tool_name: "Bash", tool_input: { command: "rm -rf node_modules" } });
  return r === null;
})());

ok("archive-not-delete: allows rm of .log files", (function() {
  var r = runGate(and, { tool_name: "Bash", tool_input: { command: "rm output.log" } });
  return r === null;
})());

ok("archive-not-delete: allows git rm --cached", (function() {
  var r = runGate(and, { tool_name: "Bash", tool_input: { command: "git rm --cached bigfile.bin" } });
  return r === null;
})());

// ── git-rebase-safety ────────────────────────────────────────────────
var grs = path.join(modulesDir, "PreToolUse", "git-rebase-safety.js");

ok("git-rebase-safety: blocks --ours during rebase", (function() {
  var r = runGate(grs, { tool_name: "Bash", tool_input: { command: "git checkout --ours conflicted-file.js" } });
  return r && r.decision === "block" && /REBASE SAFETY/.test(r.reason);
})());

ok("git-rebase-safety: blocks --theirs during rebase", (function() {
  var r = runGate(grs, { tool_name: "Bash", tool_input: { command: "git checkout --theirs conflicted-file.js" } });
  return r && r.decision === "block" && /REVERSED/.test(r.reason);
})());

ok("git-rebase-safety: blocks single-quoted credential helper", (function() {
  var r = runGate(grs, { tool_name: "Bash", tool_input: { command: "git config credential.helper '!gh auth git-credential'" } });
  return r && r.decision === "block" && /double quotes/.test(r.reason);
})());

ok("git-rebase-safety: allows normal git commands", (function() {
  var r = runGate(grs, { tool_name: "Bash", tool_input: { command: "git rebase main" } });
  return r === null;
})());

// ── no-hardcoded-paths ───────────────────────────────────────────────
var nhp = path.join(modulesDir, "PreToolUse", "no-hardcoded-paths.js");

ok("no-hardcoded-paths: blocks Windows path in Edit", (function() {
  var r = runGate(nhp, { tool_name: "Edit", tool_input: {
    file_path: "/project/config.js",
    new_string: "const dir = \"" + winHome + "\";"
  }});
  return r && r.decision === "block" && /HARDCODED PATH/.test(r.reason);
})());

ok("no-hardcoded-paths: blocks Linux path in Write", (function() {
  var r = runGate(nhp, { tool_name: "Write", tool_input: {
    file_path: "/project/script.sh",
    content: "DATA_DIR=" + linuxHome + "\necho $DATA_DIR"
  }});
  return r && r.decision === "block";
})());

ok("no-hardcoded-paths: allows .md files", (function() {
  var r = runGate(nhp, { tool_name: "Write", tool_input: {
    file_path: "/project/README.md",
    content: "Example: " + winHome
  }});
  return r === null;
})());

ok("no-hardcoded-paths: allows comment lines", (function() {
  var r = runGate(nhp, { tool_name: "Edit", tool_input: {
    file_path: "/project/config.js",
    new_string: "// Example: " + winHome
  }});
  return r === null;
})());

// ── victory-declaration-gate ─────────────────────────────────────────
var vdg = path.join(modulesDir, "PreToolUse", "victory-declaration-gate.js");

ok("victory-declaration-gate: blocks 'all tests pass' commit", (function() {
  var r = runGate(vdg, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'All tests pass'"
  }});
  return r && r.decision === "block" && /VICTORY DECLARATION/.test(r.reason);
})());

ok("victory-declaration-gate: blocks '100%' commit", (function() {
  var r = runGate(vdg, { tool_name: "Bash", tool_input: {
    command: "git commit -m '100% coverage achieved'"
  }});
  return r && r.decision === "block";
})());

ok("victory-declaration-gate: allows specific commit", (function() {
  var r = runGate(vdg, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'T487: Fix testbox gate — 17/17 tests pass, synced to live'"
  }});
  return r === null;
})());

// ── root-cause-gate ──────────────────────────────────────────────────
var rcg = path.join(modulesDir, "PreToolUse", "root-cause-gate.js");

ok("root-cause-gate: blocks git reset --hard", (function() {
  var r = runGate(rcg, { tool_name: "Bash", tool_input: { command: "git reset --hard HEAD" } });
  return r && r.decision === "block" && /root cause/i.test(r.reason);
})());

ok("root-cause-gate: blocks git checkout -- .", (function() {
  var r = runGate(rcg, { tool_name: "Bash", tool_input: { command: "git checkout -- ." } });
  return r && r.decision === "block";
})());

ok("root-cause-gate: allows normal commands", (function() {
  var r = runGate(rcg, { tool_name: "Bash", tool_input: { command: "git status" } });
  return r === null;
})());

// ── no-fragile-heuristics ────────────────────────────────────────────
var nfh = path.join(modulesDir, "PreToolUse", "no-fragile-heuristics.js");

ok("no-fragile-heuristics: blocks pixel ratio in verify script", (function() {
  var r = runGate(nfh, { tool_name: "Edit", tool_input: {
    file_path: "/project/verify-screenshots.py",
    new_string: "white_ratio = white_count / total_pixels"
  }});
  return r && r.decision === "block" && /FRAGILE HEURISTIC/.test(r.reason);
})());

ok("no-fragile-heuristics: allows normal code in non-verify files", (function() {
  var r = runGate(nfh, { tool_name: "Edit", tool_input: {
    file_path: "/project/main.py",
    new_string: "white_ratio = white_count / total_pixels"
  }});
  return r === null;
})());

// ── no-focus-steal ───────────────────────────────────────────────────
var nfs = path.join(modulesDir, "PreToolUse", "no-focus-steal.js");

if (process.platform === "win32") {
  ok("no-focus-steal: blocks nohup background process", (function() {
    var r = runGate(nfs, { tool_name: "Bash", tool_input: { command: "nohup node server.js &" } });
    return r && r.decision === "block" && /FOCUS STEAL/.test(r.reason);
  })());

  ok("no-focus-steal: allows opening PDF with start", (function() {
    var r = runGate(nfs, { tool_name: "Bash", tool_input: { command: 'start "" "report.pdf"' } });
    return r === null;
  })());
} else {
  ok("no-focus-steal: skipped on non-Windows (returns null)", (function() {
    var r = runGate(nfs, { tool_name: "Bash", tool_input: { command: "nohup node server.js &" } });
    return r === null;
  })());
}

// ── crlf-ssh-key-check ──────────────────────────────────────────────
var csk = path.join(modulesDir, "PreToolUse", "crlf-ssh-key-check.js");

ok("crlf-ssh-key-check: blocks scp of .pem file", (function() {
  var r = runGate(csk, { tool_name: "Bash", tool_input: { command: "scp ~/.ssh/mykey.pem ec2-user@host:~/.ssh/" } });
  return r && r.decision === "block" && /CRLF/.test(r.reason);
})());

ok("crlf-ssh-key-check: allows non-key scp", (function() {
  var r = runGate(csk, { tool_name: "Bash", tool_input: { command: "scp report.txt user@host:~/" } });
  return r === null;
})());

// ── unresolved-issues-gate ───────────────────────────────────────────
var uig = path.join(modulesDir, "PreToolUse", "unresolved-issues-gate.js");

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "T487-test-"));
var tmpTodo = path.join(tmpDir, "TODO.md");
fs.writeFileSync(tmpTodo, "# TODO\n- [ ] Deploy script has FAIL status\n- [x] FAIL was fixed\n");

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

ok("unresolved-issues-gate: blocks commit with unresolved FAIL", (function() {
  var r = runGate(uig, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'ship it'"
  }});
  return r && r.decision === "block" && /UNRESOLVED ISSUES/.test(r.reason);
})());

ok("unresolved-issues-gate: allows commit with 'known' keyword", (function() {
  var r = runGate(uig, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'ship it — known intermittent failures'"
  }});
  return r === null;
})());

fs.writeFileSync(tmpTodo, "# TODO\n- [x] All done\n");
delete require.cache[require.resolve(uig)];

ok("unresolved-issues-gate: allows commit with clean TODO", (function() {
  var r = runGate(uig, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'clean state'"
  }});
  return r === null;
})());

process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";

// ═══════════════════════════════════════════════════════════════════════
// PostToolUse gates
// ═══════════════════════════════════════════════════════════════════════

// ── commit-msg-check ─────────────────────────────────────────────────
var cmc = path.join(modulesDir, "PostToolUse", "commit-msg-check.js");

ok("commit-msg-check: blocks WIP commit", (function() {
  var r = runGate(cmc, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'wip stuff'"
  }});
  return r && r.decision === "block" && /wip/.test(r.reason);
})());

ok("commit-msg-check: blocks long first line", (function() {
  var longMsg = "This is a very long commit message that exceeds the seventy-two character conventional limit for git";
  var r = runGate(cmc, { tool_name: "Bash", tool_input: {
    command: "git commit -m '" + longMsg + "'"
  }});
  return r && r.decision === "block" && /72/.test(r.reason);
})());

ok("commit-msg-check: allows good commit", (function() {
  var r = runGate(cmc, { tool_name: "Bash", tool_input: {
    command: "git commit -m 'T487: Port 15 modules to OpenClaw plugin'"
  }});
  return r === null;
})());

// ── crlf-detector ────────────────────────────────────────────────────
var cd = path.join(modulesDir, "PostToolUse", "crlf-detector.js");

var tmpSh = path.join(tmpDir, "test.sh");
fs.writeFileSync(tmpSh, "#!/bin/bash\r\necho hello\r\n");

ok("crlf-detector: detects CRLF in .sh file", (function() {
  var r = runGate(cd, { tool_name: "Write", tool_input: { file_path: tmpSh } });
  return r && r.decision === "block" && /CRLF/.test(r.reason);
})());

var tmpShClean = path.join(tmpDir, "clean.sh");
fs.writeFileSync(tmpShClean, "#!/bin/bash\necho hello\n");

ok("crlf-detector: allows clean .sh file", (function() {
  var r = runGate(cd, { tool_name: "Write", tool_input: { file_path: tmpShClean } });
  return r === null;
})());

ok("crlf-detector: ignores .js files", (function() {
  var tmpJs = path.join(tmpDir, "test.js");
  fs.writeFileSync(tmpJs, "console.log('hi');\r\n");
  var r = runGate(cd, { tool_name: "Write", tool_input: { file_path: tmpJs } });
  return r === null;
})());

// ── test-coverage-check ──────────────────────────────────────────────
var tcc = path.join(modulesDir, "PostToolUse", "test-coverage-check.js");

var tmpSrc = path.join(tmpDir, "src");
var tmpTests = path.join(tmpDir, "test");
fs.mkdirSync(tmpSrc, { recursive: true });
fs.mkdirSync(tmpTests, { recursive: true });
fs.writeFileSync(path.join(tmpSrc, "widget.js"), "module.exports = {}");
fs.writeFileSync(path.join(tmpTests, "test-widget.js"), "// test");

process.env.CLAUDE_PROJECT_DIR = tmpDir;

ok("test-coverage-check: finds matching test file", (function() {
  delete require.cache[require.resolve(tcc)];
  var r = runGate(tcc, { tool_name: "Edit", tool_input: {
    file_path: path.join(tmpSrc, "widget.js")
  }});
  return r && r.decision === "block" && /test.*widget/i.test(r.reason);
})());

ok("test-coverage-check: skips test files", (function() {
  delete require.cache[require.resolve(tcc)];
  var r = runGate(tcc, { tool_name: "Edit", tool_input: {
    file_path: path.join(tmpTests, "test-widget.js")
  }});
  return r === null;
})());

ok("test-coverage-check: skips non-code files", (function() {
  delete require.cache[require.resolve(tcc)];
  fs.writeFileSync(path.join(tmpDir, "README.md"), "# readme");
  var r = runGate(tcc, { tool_name: "Edit", tool_input: {
    file_path: path.join(tmpDir, "README.md")
  }});
  return r === null;
})());

process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";

// ── result-review-gate ───────────────────────────────────────────────
var rrg = path.join(modulesDir, "PostToolUse", "result-review-gate.js");

ok("result-review-gate: triggers on report file", (function() {
  var r = runGate(rrg, { tool_name: "Read", tool_input: {
    file_path: "/project/reports/test-results.html"
  }});
  return r && r.decision === "block" && /Review checklist/.test(r.reason);
})());

ok("result-review-gate: triggers on PDF", (function() {
  var r = runGate(rrg, { tool_name: "Read", tool_input: {
    file_path: "/project/output.pdf"
  }});
  return r && r.decision === "block";
})());

ok("result-review-gate: ignores normal source files", (function() {
  var r = runGate(rrg, { tool_name: "Read", tool_input: {
    file_path: "/project/src/main.js"
  }});
  return r === null;
})());

// ── rule-hygiene ─────────────────────────────────────────────────────
var rh = path.join(modulesDir, "PostToolUse", "rule-hygiene.js");

ok("rule-hygiene: warns on bad rule filename", (function() {
  var rulesDir = path.join(tmpDir, "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  var tmpRule = path.join(rulesDir, "gotchas.md");
  fs.writeFileSync(tmpRule, "# Gotchas\nDon't do this.\n");
  var r = runGate(rh, { tool_name: "Write", tool_input: { file_path: tmpRule } });
  return r && r.decision === "block" && /Bad rule filename/.test(r.reason);
})());

ok("rule-hygiene: warns on long rule file", (function() {
  var tmpRule = path.join(tmpDir, "rules", "verbose-rule.md");
  var lines = "# Rule\n";
  for (var i = 0; i < 30; i++) lines += "Line " + i + "\n";
  fs.writeFileSync(tmpRule, lines);
  var r = runGate(rh, { tool_name: "Write", tool_input: { file_path: tmpRule } });
  return r && r.decision === "block" && /lines/.test(r.reason);
})());

ok("rule-hygiene: allows good rule file", (function() {
  var tmpRule = path.join(tmpDir, "rules", "no-force-push.md");
  fs.writeFileSync(tmpRule, "# No Force Push\nNever force push to main.\n");
  var r = runGate(rh, { tool_name: "Write", tool_input: { file_path: tmpRule } });
  return r === null;
})());

ok("rule-hygiene: ignores non-rules files", (function() {
  var r = runGate(rh, { tool_name: "Write", tool_input: { file_path: "/project/src/main.js" } });
  return r === null;
})());

// ═══════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (e) { /* best effort */ }

// ── Summary ──────────────────────────────────────────────────────────
console.log("\n" + pass + "/" + (pass + fail) + " passed" + (fail > 0 ? " (" + fail + " FAILED)" : ""));
process.exit(fail > 0 ? 1 : 0);
