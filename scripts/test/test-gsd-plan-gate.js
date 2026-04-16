#!/usr/bin/env node
"use strict";
// T452: E2E tests for gsd-plan-gate module.
// Tests the GSD pipeline enforcement: .planning/ROADMAP.md → phases → PLAN.md
//
// Uses HOOK_RUNNER_MODULES_DIR for isolation (same pattern as test-e2e-enforcement.js).

var cp = require("child_process");
var path = require("path");
var fs = require("fs");
var os = require("os");

var runnerDir = path.join(__dirname, "..", "..");
var catalogDir = path.join(runnerDir, "modules");
var passed = 0, failed = 0;

function createEnv(opts) {
  // opts: { hasRoadmap, phases, hasTodo, phaseDirs }
  var tmpBase = path.join(os.tmpdir(), "gsd-test-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
  var modulesDir = path.join(tmpBase, "run-modules");
  var projectDir = path.join(tmpBase, "project");

  fs.mkdirSync(tmpBase, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  // Workflow config enabling gsd
  fs.writeFileSync(path.join(projectDir, "workflow-config.json"),
    JSON.stringify({ gsd: true }) + "\n");

  // Minimal .git/HEAD
  var gitDir = path.join(projectDir, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/test-branch\n");

  // TODO.md
  if (opts.hasTodo) {
    fs.writeFileSync(path.join(projectDir, "TODO.md"), "- [ ] Fix something\n");
  }

  // .planning/ROADMAP.md
  if (opts.hasRoadmap) {
    var planningDir = path.join(projectDir, ".planning");
    fs.mkdirSync(planningDir, { recursive: true });

    var roadmapContent = "# Roadmap\n\n";
    var phases = opts.phases || [];
    for (var i = 0; i < phases.length; i++) {
      roadmapContent += "## Phase " + phases[i].number + ": " + phases[i].name + "\n\n";
      roadmapContent += "**Goal:** " + phases[i].name + "\n\n";
    }
    fs.writeFileSync(path.join(planningDir, "ROADMAP.md"), roadmapContent);

    // Phase directories with optional PLAN.md
    var phaseDirs = opts.phaseDirs || [];
    if (phaseDirs.length > 0) {
      var phasesBaseDir = path.join(planningDir, "phases");
      fs.mkdirSync(phasesBaseDir, { recursive: true });
      for (var j = 0; j < phaseDirs.length; j++) {
        var pd = phaseDirs[j];
        var dirName = pd.number + "-" + pd.slug;
        var phaseDir = path.join(phasesBaseDir, dirName);
        fs.mkdirSync(phaseDir, { recursive: true });
        if (pd.hasPlan) {
          fs.writeFileSync(path.join(phaseDir, "PLAN.md"), "# Plan\n\nDo the thing.\n");
        }
      }
    }
  }

  // Copy gsd-plan-gate module
  var eventDir = path.join(modulesDir, "PreToolUse");
  fs.mkdirSync(eventDir, { recursive: true });
  fs.copyFileSync(
    path.join(catalogDir, "PreToolUse", "gsd-plan-gate.js"),
    path.join(eventDir, "gsd-plan-gate.js")
  );

  return { tmpBase: tmpBase, modulesDir: modulesDir, projectDir: projectDir };
}

function cleanup(env) {
  try { fs.rmSync(env.tmpBase, { recursive: true, force: true }); } catch (e) {}
}

function test(name, opts) {
  var runner = path.join(runnerDir, opts.runner || "run-pretooluse.js");
  var input = JSON.stringify(opts.input);
  var isolated = createEnv(opts.env || {});

  var env = {};
  var envKeys = Object.keys(process.env);
  for (var i = 0; i < envKeys.length; i++) env[envKeys[i]] = process.env[envKeys[i]];

  var tmpFile = path.join(os.tmpdir(), "gsd-test-input-" + process.pid + "-" + Date.now() + ".json");
  fs.writeFileSync(tmpFile, input);
  env.HOOK_INPUT_FILE = tmpFile;
  env.HOOK_RUNNER_TEST = "1";
  env.HOOK_RUNNER_MODULES_DIR = isolated.modulesDir;
  env.CLAUDE_PROJECT_DIR = isolated.projectDir;

  var result = cp.spawnSync(process.execPath, [runner], {
    input: input,
    env: env,
    timeout: 10000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  try { fs.unlinkSync(tmpFile); } catch (e) {}
  cleanup(isolated);

  var stdout = (result.stdout || "").toString();
  var stderr = (result.stderr || "").toString();

  var ok = true;
  var reasons = [];

  if (opts.expectBlock) {
    if (result.status === 0 && stdout.length === 0) {
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
        if (opts.expectReason && stdout.indexOf(opts.expectReason) === -1) {
          ok = false;
          reasons.push("block reason missing '" + opts.expectReason + "'");
        }
      } catch (e) {}
    }
  } else {
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
    for (var r = 0; r < reasons.length; r++) console.log("  " + reasons[r]);
    if (stderr.length > 0 && !ok) console.log("  stderr: " + stderr.slice(0, 300));
  }
}

// === Tests ===

// 1. No .planning, no TODO.md → block
test("blocks when no .planning and no TODO.md", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "GSD GATE"
});

// 2. No .planning but TODO.md with tasks → pass
test("allows when TODO.md has unchecked tasks", {
  env: { hasRoadmap: false, hasTodo: true },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 3. ROADMAP.md with no phases → block
test("blocks when ROADMAP.md has no phases", {
  env: { hasRoadmap: true, phases: [], hasTodo: false },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "no phases"
});

// 4. ROADMAP.md with phases but no phase dirs (early project) → pass
test("allows early project with phases but no phase dirs", {
  env: {
    hasRoadmap: true,
    phases: [{ number: "1", name: "Setup" }, { number: "2", name: "Core" }],
    hasTodo: false
  },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 5. Phase dirs exist but no PLAN.md → block
test("blocks when phase dirs exist but no PLAN.md", {
  env: {
    hasRoadmap: true,
    phases: [{ number: "1", name: "Setup" }],
    phaseDirs: [{ number: "1", slug: "setup", hasPlan: false }],
    hasTodo: false
  },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "No active phase has a PLAN.md"
});

// 6. Phase dir with PLAN.md → pass
test("allows when phase has PLAN.md", {
  env: {
    hasRoadmap: true,
    phases: [{ number: "1", name: "Setup" }],
    phaseDirs: [{ number: "1", slug: "setup", hasPlan: true }],
    hasTodo: false
  },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 7. .planning/ files always allowed (even without roadmap)
test("allows editing .planning/ files always", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Write",
    tool_input: { file_path: "/tmp/project/.planning/ROADMAP.md", content: "# Roadmap" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 8. TODO.md always allowed
test("allows editing TODO.md always", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/TODO.md", old_string: "a", new_string: "b" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 9. Read-only Bash always passes
test("allows read-only bash commands", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Bash",
    tool_input: { command: "git status" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 10. State-changing Bash blocked without plan
test("blocks state-changing bash without plan", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Bash",
    tool_input: { command: "npm run build" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: true,
  expectReason: "GSD GATE"
});

// 11. Read tool always passes
test("Read tool always passes", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Read",
    tool_input: { file_path: "/tmp/test.js" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// 12. Test files always allowed
test("allows test file edits", {
  env: { hasRoadmap: false, hasTodo: false },
  input: {
    tool_name: "Write",
    tool_input: { file_path: "/tmp/project/scripts/test/test-foo.js", content: "test" },
    _git: { branch: "test-branch", tracking: true }
  },
  expectBlock: false
});

// === Summary ===
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
