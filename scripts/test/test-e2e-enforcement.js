#!/usr/bin/env node
"use strict";
// T447: E2E enforcement tests — isolated from live hooks environment.
// Each test creates a temp modules dir with only the specific module(s) needed,
// a workflow-config.json enabling shtd, and runs the runner against that.
//
// Previously failed because:
// 1. Repo's run-modules/ only had a subset of modules (missing git-destructive-guard etc.)
// 2. Live session state (commit-counter, workflow) interfered with test expectations
// 3. No Stop modules in repo's run-modules/ at all
//
// Fix: HOOK_RUNNER_MODULES_DIR env var + per-test isolated temp dirs.
//
// Usage: node scripts/test/test-e2e-enforcement.js

var cp = require("child_process");
var path = require("path");
var fs = require("fs");
var os = require("os");

var runnerDir = path.join(__dirname, "..", "..");
var catalogDir = path.join(runnerDir, "modules");
var passed = 0, failed = 0;

// Create isolated temp environment for a test
function createIsolatedEnv(modules) {
  // modules: [{event: "PreToolUse", name: "git-destructive-guard.js"}, ...]
  var tmpBase = path.join(os.tmpdir(), "e2e-" + process.pid + "-" + Date.now());
  var modulesDir = path.join(tmpBase, "run-modules");
  var projectDir = path.join(tmpBase, "project");

  fs.mkdirSync(tmpBase, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  // Create workflow-config.json enabling shtd + starter
  fs.writeFileSync(path.join(projectDir, "workflow-config.json"),
    JSON.stringify({ shtd: true, starter: true }) + "\n");

  // Create a minimal .git/HEAD so git-related checks don't crash
  var gitDir = path.join(projectDir, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/test-branch\n");

  // Create TODO.md with an unchecked task (so spec-gate doesn't block)
  fs.writeFileSync(path.join(projectDir, "TODO.md"), "- [ ] T999: Test task\n");

  // Copy requested modules into isolated run-modules dir
  var events = {};
  for (var i = 0; i < modules.length; i++) {
    var m = modules[i];
    if (!events[m.event]) events[m.event] = [];
    events[m.event].push(m.name);
  }
  var eventNames = Object.keys(events);
  for (var e = 0; e < eventNames.length; e++) {
    var eventName = eventNames[e];
    var eventDir = path.join(modulesDir, eventName);
    fs.mkdirSync(eventDir, { recursive: true });
    var modNames = events[eventName];
    for (var j = 0; j < modNames.length; j++) {
      var src = path.join(catalogDir, eventName, modNames[j]);
      var dest = path.join(eventDir, modNames[j]);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
  }

  return { tmpBase: tmpBase, modulesDir: modulesDir, projectDir: projectDir };
}

function cleanupEnv(env) {
  try { fs.rmSync(env.tmpBase, { recursive: true, force: true }); } catch (e) {}
}

function test(name, opts) {
  var runner = path.join(runnerDir, opts.runner);
  var input = JSON.stringify(opts.input);

  // Create isolated environment
  var isolated = createIsolatedEnv(opts.modules || []);

  // Build clean env
  var env = {};
  var envKeys = Object.keys(process.env);
  for (var i = 0; i < envKeys.length; i++) env[envKeys[i]] = process.env[envKeys[i]];

  // Use temp file approach like run-hidden.js does
  var tmpFile = path.join(os.tmpdir(), "e2e-test-" + process.pid + "-" + Date.now() + ".json");
  fs.writeFileSync(tmpFile, input);
  env.HOOK_INPUT_FILE = tmpFile;
  env.HOOK_RUNNER_TEST = "1";
  env.HOOK_RUNNER_MODULES_DIR = isolated.modulesDir;
  env.CLAUDE_PROJECT_DIR = opts.projectDir || isolated.projectDir;

  var result = cp.spawnSync(process.execPath, [runner], {
    input: input,
    env: env,
    timeout: 10000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  try { fs.unlinkSync(tmpFile); } catch (e) {}
  cleanupEnv(isolated);

  var exitCode = result.status;
  var stdout = (result.stdout || "").toString();
  var stderr = (result.stderr || "").toString();

  var ok = true;
  var reasons = [];

  if (opts.expectBlock) {
    if (exitCode === 0 && stdout.length === 0) {
      ok = false;
      reasons.push("expected block but got pass (exit 0, no stdout)");
    }
    if (stdout.length > 0) {
      try {
        var parsed = JSON.parse(stdout);
        if (parsed.decision !== "block") {
          ok = false;
          reasons.push("stdout JSON has decision=" + parsed.decision + ", expected block");
        }
        if (opts.expectReason) {
          if (stdout.indexOf(opts.expectReason) === -1) {
            ok = false;
            reasons.push("block reason missing '" + opts.expectReason + "'");
          }
        }
      } catch (e) {
        // Non-JSON stdout is fine for stop hooks
      }
    }
  } else {
    // Expect pass
    if (stdout.length > 0) {
      try {
        var p = JSON.parse(stdout);
        if (p.decision === "block") {
          ok = false;
          reasons.push("expected pass but got block: " + (p.reason || "").slice(0, 150));
        }
      } catch (e) {}
    }
  }

  if (ok) {
    passed++;
    console.log("OK: " + name);
  } else {
    failed++;
    console.log("FAIL: " + name);
    for (var r = 0; r < reasons.length; r++) {
      console.log("  " + reasons[r]);
    }
    if (stderr.length > 0 && !ok) {
      console.log("  stderr: " + stderr.slice(0, 300));
    }
  }
}

// === PreToolUse E2E Tests ===

// 1. git-destructive-guard: should block git reset --hard
test("git-destructive-guard: blocks git reset --hard", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "git-destructive-guard.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "git reset --hard HEAD~1" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "DESTRUCTIVE"
});

// 2. git-destructive-guard: should block git checkout .
test("git-destructive-guard: blocks git checkout .", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "git-destructive-guard.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "git checkout ." },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "DESTRUCTIVE"
});

// 3. archive-not-delete: should block rm command
test("archive-not-delete: blocks rm on files", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "archive-not-delete.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "rm scripts/test/old-test.js" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "delete"
});

// 4. force-push-gate: should block git push --force
test("force-push-gate: blocks force push", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "force-push-gate.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "git push --force origin main" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true
});

// 5. no-rules-gate: should block creating .claude/rules files
test("no-rules-gate: blocks creating rules files", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "no-rules-gate.js" }],
  input: {
    tool_name: "Write",
    tool_input: {
      file_path: path.join(os.homedir(), ".claude", "rules", "new-rule.md").replace(/\\/g, "/"),
      content: "# Some rule\nDo this thing."
    },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "rules"
});

// 6. branch-pr-gate: Edit on main should be blocked
test("branch-pr-gate: blocks Edit on main", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "branch-pr-gate.js" }],
  input: {
    tool_name: "Edit",
    tool_input: {
      file_path: "/tmp/test-project/src/app.js",
      old_string: "foo",
      new_string: "bar"
    },
    _git: { branch: "main", tracking: true }
  },
  expectBlock: true
});

// 7. Normal operation: Read should always pass (no modules = no blocks)
test("normal: Read always passes", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "git-destructive-guard.js" }],
  input: {
    tool_name: "Read",
    tool_input: { file_path: "/tmp/test.js" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 8. Normal operation: safe Bash commands pass destructive guard
test("normal: git log passes destructive guard", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "git-destructive-guard.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "git log --oneline -5" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 9. archive-not-delete: allows mv (not a delete)
test("archive-not-delete: allows mv command", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "archive-not-delete.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "mv old.js archive/old.js" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 10. force-push-gate: allows normal push
test("force-push-gate: allows normal push", {
  runner: "run-pretooluse.js",
  modules: [{ event: "PreToolUse", name: "force-push-gate.js" }],
  input: {
    tool_name: "Bash",
    tool_input: { command: "git push origin main" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// === Stop E2E Tests ===

// 11. auto-continue: Stop should block (auto-continue fires)
test("auto-continue: Stop hook blocks to continue work", {
  runner: "run-stop.js",
  modules: [{ event: "Stop", name: "auto-continue.js" }],
  input: {
    session_id: "test-e2e",
    stop_hook_active: false
  },
  expectBlock: true
});

// === Summary ===
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
