// TOOLS: Bash, Edit, Write
// WORKFLOW: gsd
// WHY: Claude dived into coding without a GSD plan, producing untracked work
// that couldn't be reviewed via PRs or traced to any roadmap phase.
// This gate enforces the GSD pipeline: .planning/ROADMAP.md must exist with
// at least one phase, and code edits require either an active phase with a
// PLAN.md or unchecked tasks in TODO.md.
"use strict";
var fs = require("fs");
var path = require("path");

// File patterns always allowed (planning, config, tests, docs)
var ALLOW_PATTERNS = [
  /TODO\.md$/i, /SESSION_STATE\.md$/i, /CLAUDE\.md$/i, /README\.md$/i,
  /CHANGELOG\.md$/i,
  /\.planning[\/\\]/, /\.specify[\/\\]/, /specs[\/\\]/,
  /\.claude[\/\\]/, /\.github[\/\\]/, /\/hooks[\/\\]/, /\/rules[\/\\]/,
  /\.gitignore$/, /package\.json$/, /package-lock\.json$/,
  /tsconfig[^/]*\.json$/, /\.eslintrc/, /\.prettierrc/,
  /jest\.config/, /vitest\.config/,
  /scripts\/test\//, /[\/\\]tests?[\/\\]/, /\.test\.[jt]s$/, /\.spec\.[jt]s$/,
];

// Bash commands that are read-only — fast-path allow
var BASH_ALLOW_PATTERNS = [
  /^\s*git\b/, /^\s*gh\b/, /^\s*gh_auto\b/,
  /^\s*ls\b/, /^\s*dir\b/, /^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/,
  /^\s*grep\b/, /^\s*rg\b/, /^\s*find\b/, /^\s*fd\b/,
  /^\s*wc\b/, /^\s*diff\b/,
  /^\s*pwd\b/, /^\s*env\b/, /^\s*which\b/, /^\s*type\b/, /^\s*where\b/,
  /^\s*file\b/, /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/,
  /^\s*cd\b/, /^\s*readlink\b/, /^\s*realpath\b/,
  /^\s*jq\b/, /^\s*yq\b/, /^\s*sort\b/, /^\s*uniq\b/, /^\s*cut\b/, /^\s*tr\b/,
  /^\s*test\b/, /^\s*\[\s/, /^\s*true\b/, /^\s*false\b/,
  /^\s*date\b/, /^\s*hostname\b/, /^\s*whoami\b/, /^\s*id\b/,
  /^\s*node\s+-e\b/, /^\s*node\s+--eval\b/,
  /^\s*python\s+-c\b/,
  /^\s*bash\s+scripts\/test\//,
  /^\s*node\s+setup\.js\s+--test/,
  /^\s*curl\s/,
];

// T542: Write-pattern detection. Only commands matching these patterns require
// plan/TODO check. Everything else is allowed as exploration.
var BASH_WRITE_PATTERNS = require("./_bash-write-patterns");

// Cache for ROADMAP.md parsing (per process — each hook invocation is fresh)
var _cache = {};

function findProjectRoot(startDir) {
  var dir = startDir;
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir.replace(/\\/g, "/");
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Parse ROADMAP.md to extract phases.
 * Returns array of {number, name, hasDir, hasPlan}
 */
function parseRoadmap(projectDir) {
  var cacheKey = projectDir;
  if (_cache[cacheKey]) return _cache[cacheKey];

  var roadmapPath = path.join(projectDir, ".planning", "ROADMAP.md");
  if (!fs.existsSync(roadmapPath)) {
    _cache[cacheKey] = null;
    return null;
  }

  var content;
  try { content = fs.readFileSync(roadmapPath, "utf-8"); }
  catch (e) { _cache[cacheKey] = null; return null; }

  // Match ## Phase N: Title or ## Phase N — Title
  var phaseRegex = /^##\s+Phase\s+(\d+(?:\.\d+)?)[:\s—–-]+(.*)$/gm;
  var phases = [];
  var match;
  while ((match = phaseRegex.exec(content)) !== null) {
    var num = match[1];
    var name = match[2].trim();
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    // Check for phase directory (pattern: N-slug)
    var phasesDir = path.join(projectDir, ".planning", "phases");
    var hasDir = false;
    var hasPlan = false;
    if (fs.existsSync(phasesDir)) {
      try {
        var entries = fs.readdirSync(phasesDir);
        for (var i = 0; i < entries.length; i++) {
          // Match directories starting with the phase number
          if (entries[i].indexOf(num + "-") === 0 || entries[i] === num) {
            var phaseDir = path.join(phasesDir, entries[i]);
            if (fs.statSync(phaseDir).isDirectory()) {
              hasDir = true;
              // Check for PLAN.md or *-PLAN.md
              var phaseFiles = fs.readdirSync(phaseDir);
              for (var j = 0; j < phaseFiles.length; j++) {
                if (/PLAN\.md$/i.test(phaseFiles[j])) {
                  hasPlan = true;
                  break;
                }
              }
              break;
            }
          }
        }
      } catch (e) {}
    }

    phases.push({ number: num, name: name, slug: slug, hasDir: hasDir, hasPlan: hasPlan });
  }

  _cache[cacheKey] = phases;
  return phases;
}

/**
 * Check if TODO.md has unchecked tasks (fallback for simple projects)
 */
function hasTodoTasks(projectDir) {
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var content = fs.readFileSync(todoPath, "utf-8");
    return /- \[ \] /.test(content);
  } catch (e) { return false; }
}

/**
 * Extract phase number from branch name.
 * Patterns: phase-3-slug, 338-phase-3-slug, NNN-T448-..., phase3/slug
 */
function branchPhaseNumber(branch) {
  if (!branch || branch === "main" || branch === "master" || branch === "HEAD") return "";
  // "phase-3-slug" or "338-phase-3-slug"
  var m = branch.match(/phase[- ]?(\d+(?:\.\d+)?)/i);
  if (m) return m[1];
  return "";
}

module.exports = function(input) {
  var tool = input.tool_name;
  var isBash = (tool === "Bash");
  if (tool !== "Edit" && tool !== "Write" && !isBash) return null;

  // For Bash: check if it's a read-only command
  if (isBash) {
    var bashInput = input.tool_input;
    if (typeof bashInput === "string") { try { bashInput = JSON.parse(bashInput); } catch(e) { bashInput = {}; } }
    var cmd = ((bashInput || {}).command || "").trim();
    if (!cmd) return null;

    var realCmd = cmd.replace(/^(\s*cd\s+[^;&|]+\s*&&\s*)+/, "").trim();
    var firstCmd = realCmd.split("|")[0].trim();

    for (var bai = 0; bai < BASH_ALLOW_PATTERNS.length; bai++) {
      if (BASH_ALLOW_PATTERNS[bai].test(firstCmd)) return null;
    }

    // T542: Check write patterns. Only writes require plan/TODO check.
    var isWrite = false;
    for (var wi = 0; wi < BASH_WRITE_PATTERNS.length; wi++) {
      if (BASH_WRITE_PATTERNS[wi].test(cmd)) { isWrite = true; break; }
    }
    if (!isWrite) return null;
    // Write command falls through to plan check
  }

  // For Edit/Write: check file path allowlist
  var targetFile = "";
  if (!isBash) {
    try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; }
    catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
    if (!targetFile) return null;
    var norm = targetFile.replace(/\\/g, "/");

    for (var i = 0; i < ALLOW_PATTERNS.length; i++) {
      if (ALLOW_PATTERNS[i].test(norm)) return null;
    }

    // Allow user home config
    var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
    if (home && norm.indexOf(home + "/.claude/") === 0) return null;
  }

  // Find project root(s)
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var roots = [];
  if (projectDir) roots.push(projectDir);
  if (!isBash && targetFile) {
    var fileRoot = findProjectRoot(path.dirname(targetFile));
    if (fileRoot && roots.indexOf(fileRoot) === -1) roots.push(fileRoot);
  }
  if (roots.length === 0) return null;

  // Check each root for GSD artifacts
  for (var ri = 0; ri < roots.length; ri++) {
    var root = roots[ri];
    var phases = parseRoadmap(root);

    // No .planning/ROADMAP.md — check TODO.md fallback
    if (!phases) {
      if (hasTodoTasks(root)) return null; // simple project with TODO tasks
      continue; // try next root
    }

    // ROADMAP exists but no phases parsed — project is initializing
    if (phases.length === 0) {
      return {
        decision: "block",
        reason: "BLOCKED: Code changes without a GSD plan document containing defined phases\nWHY: Unplanned coding leads to untracked work and lost visibility into what was actually built\nNEXT STEPS:\n1. Add phase definitions to .planning/ROADMAP.md (e.g., Discovery, Implementation, Testing, Release)\n2. Map your intended changes to specific phases before proceeding\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gsd-plan-gate — {describe the issue}\""
      };
    }

    // At least one phase with a PLAN.md = ready to execute
    var anyPlan = false;
    for (var pi = 0; pi < phases.length; pi++) {
      if (phases[pi].hasPlan) { anyPlan = true; break; }
    }

    // TODO.md with unchecked tasks is also valid (for quick tasks, bug fixes)
    if (hasTodoTasks(root)) return null;

    if (!anyPlan) {
      // Roadmap exists, phases exist, but no plans yet
      // Allow if this is a young project (< 3 phases, no phase dirs yet)
      var anyDir = false;
      for (var di = 0; di < phases.length; di++) {
        if (phases[di].hasDir) { anyDir = true; break; }
      }
      if (!anyDir) {
        // No phase directories — project is in early planning, allow work
        return null;
      }

      return {
        decision: "block",
        reason: "BLOCKED: Code changes without a documented GSD plan\nWHY: Unplanned work creates untracked changes and makes it impossible to review what was actually attempted and why\nNEXT STEPS:\n1. Create a PLAN.md file in the active phase documenting the approach before coding\n2. Include problem statement, proposed solution, and acceptance criteria in the plan\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gsd-plan-gate — {describe the issue}\""
      };
    }

    // Has a plan — allow
    return null;
  }

  // No roots had GSD artifacts or TODO tasks — block
  var blocked = isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile);
  return {
    decision: "block",
    reason: "BLOCKED: Code changes without a GSD plan tracked in .planning/ROADMAP.md or TODO.md\nWHY: Unplanned coding leads to lost work context, duplicate effort, and tasks that cannot be tracked or reviewed\nNEXT STEPS:\n1. Create .planning/ROADMAP.md or .planning/TODO.md with your planned tasks\n2. Document what you will build, why, and acceptance criteria before coding\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gsd-plan-gate — {describe the issue}\""
  };
};
