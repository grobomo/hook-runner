// WORKFLOW: shtd
// WHY: Claude implemented features that nobody asked for, wasting hours.
// T321: Strengthened — if branch has TXXX, that specific task must be unchecked.
// T322: Cross-project guidance in block messages.
// T323: "Spec before code" explicit reminder in all block messages.
// T374: Task ID match takes priority over fuzzy word matching — prevents false positives.
// T384: Allowlist session management scripts (new_session.py, context_reset.py) and curl.
"use strict";
// requires: enforcement-gate
// Spec gate: enforces spec → tasks → code pipeline.
// 1. Code edits require a spec (specs/<feature>/spec.md) to exist
// 2. That spec must have tasks (specs/<feature>/tasks.md) with unchecked items
// 3. If branch has TXXX pattern, that specific task must be unchecked
// 4. Feature is matched by git branch name or falls back to any spec with open tasks
// Allows: config, specs, planning, rules, hooks, TODO.md, SESSION_STATE.md, test files
var fs = require("fs");
var path = require("path");

// --- Caching layer (T420) ---
// spec-gate runs on every Edit/Write/Bash call. The specs/ directory scan is ~62ms
// and autoActivateShtd is ~7ms. Cache both with mtime invalidation.
var _cache = {
  shtdActivated: {},  // projectDir → true (once per process)
  specScans: {},      // specsDir → { mtime, entries }
  todoReads: {},      // todoPath → { mtime, content, hasUnchecked }
  taskReads: {},      // tasksPath → { mtime, content }
};

function cachedReadFile(filePath) {
  try {
    var stat = fs.statSync(filePath);
    var mtime = stat.mtimeMs;
    var cached = _cache.taskReads[filePath];
    if (cached && cached.mtime === mtime) return cached.content;
    var content = fs.readFileSync(filePath, "utf-8");
    _cache.taskReads[filePath] = { mtime: mtime, content: content };
    return content;
  } catch (e) { return null; }
}

function cachedTodoRead(todoPath) {
  try {
    var stat = fs.statSync(todoPath);
    var mtime = stat.mtimeMs;
    var cached = _cache.todoReads[todoPath];
    if (cached && cached.mtime === mtime) return cached;
    var content = fs.readFileSync(todoPath, "utf-8");
    var result = { mtime: mtime, content: content, hasUnchecked: /- \[ \] T\d+/.test(content) };
    _cache.todoReads[todoPath] = result;
    return result;
  } catch (e) { return null; }
}

function cachedSpecScan(specsDir) {
  try {
    var stat = fs.statSync(specsDir);
    var mtime = stat.mtimeMs;
    var cached = _cache.specScans[specsDir];
    if (cached && cached.mtime === mtime) {
      // T422: Directory listing is cached, but re-check task content freshness.
      // Editing tasks.md doesn't change parent specs/ dir mtime, so hasUnchecked
      // could be stale. cachedReadFile has its own mtime check per file.
      for (var ci = 0; ci < cached.entries.length; ci++) {
        if (cached.entries[ci].hasTasks) {
          var ctPath = path.join(specsDir, cached.entries[ci].dir, "tasks.md");
          var ctc = cachedReadFile(ctPath);
          cached.entries[ci].hasUnchecked = ctc ? /- \[ \] T\d+/.test(ctc) : false;
        }
      }
      return cached.entries;
    }
    var specDirs = fs.readdirSync(specsDir);
    var entries = [];
    for (var j = 0; j < specDirs.length; j++) {
      var specBase = path.join(specsDir, specDirs[j]);
      try { if (!fs.statSync(specBase).isDirectory()) continue; } catch (e) { continue; }
      var hasSpec = fs.existsSync(path.join(specBase, "spec.md"));
      var tasksPath = path.join(specBase, "tasks.md");
      var hasTasks = fs.existsSync(tasksPath);
      var hasUnchecked = false;
      if (hasTasks) {
        var tc = cachedReadFile(tasksPath);
        if (tc) hasUnchecked = /- \[ \] T\d+/.test(tc);
      }
      entries.push({ dir: specDirs[j], hasSpec: hasSpec, hasTasks: hasTasks, hasUnchecked: hasUnchecked });
    }
    _cache.specScans[specsDir] = { mtime: mtime, entries: entries };
    return entries;
  } catch (e) { return []; }
}

// T079: Auto-activate SHTD workflow state when shtd is enabled but no state exists
// T420: Cached — only runs once per projectDir per process (~7ms saved per call)
function autoActivateShtd(projectDir) {
  if (_cache.shtdActivated[projectDir]) return;
  _cache.shtdActivated[projectDir] = true;
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
    // Read .git/HEAD directly — avoids spawning git (slow on Windows, can timeout)
    var head = fs.readFileSync(path.join(gitRoot, ".git", "HEAD"), "utf-8").trim();
    // "ref: refs/heads/main" → "main", detached HEAD → "HEAD"
    if (head.indexOf("ref: refs/heads/") === 0) return head.slice(16);
    return "HEAD";
  } catch (e) { return ""; }
}

// T321: Extract task ID (TXXX) from branch name
// e.g. "195-T319-T320-catalog-sync" → "T319" (first match)
// e.g. "fix/T042-docs" → "T042"
function branchTaskId(branch) {
  if (!branch || branch === "main" || branch === "master" || branch === "HEAD") return "";
  var m = branch.match(/T(\d+)/i);
  return m ? "T" + m[1] : "";
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

// T321: Check if a specific task ID is unchecked in a tasks.md or TODO.md content string
// T363: Also matches subtasks — branch T331 matches unchecked T331a, T331b, etc.
function isTaskUnchecked(content, taskId) {
  // Match "- [ ] T319" or "- [ ] T319:" or "- [ ] T319a" (subtask)
  var pattern = new RegExp("- \\[ \\] " + taskId + "[a-z]?[:\\s]");
  return pattern.test(content);
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

// T322+T323: Common block message suffixes
var SPEC_BEFORE_CODE = "\nREMINDER: Write the spec FIRST, then create tasks, then code. Do not skip to implementation.";
var CROSS_PROJECT_HINT = "\nCROSS-PROJECT? If this file belongs to another project, do NOT edit it here.\n" +
  "  1) Write TODO items in THAT project's TODO.md (cwd-drift-detector allows this)\n" +
  "  2) Spawn a new session there: python context_reset.py --project-dir /path/to/project\n" +
  "  3) Resume your own work here";

// T338: Bash commands that are read-only/exploration — always allowed
var BASH_ALLOW_PATTERNS = [
  /^\s*git\b/, /^\s*gh\b/, /^\s*gh_auto\b/,
  /^\s*ls\b/, /^\s*dir\b/, /^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/,
  /^\s*grep\b/, /^\s*rg\b/, /^\s*find\b/, /^\s*fd\b/,
  /^\s*wc\b/, /^\s*diff\b/, /^\s*echo\b/, /^\s*printf\b/,
  /^\s*pwd\b/, /^\s*env\b/, /^\s*which\b/, /^\s*type\b/, /^\s*where\b/,
  /^\s*file\b/, /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/,
  /^\s*cd\b/, /^\s*readlink\b/, /^\s*realpath\b/,
  /^\s*jq\b/, /^\s*yq\b/, /^\s*sort\b/, /^\s*uniq\b/, /^\s*cut\b/, /^\s*tr\b/,
  /^\s*test\b/, /^\s*\[\s/, /^\s*true\b/, /^\s*false\b/,
  /^\s*date\b/, /^\s*hostname\b/, /^\s*whoami\b/, /^\s*id\b/,
  /^\s*node\s+-e\b/, /^\s*node\s+--eval\b/, // quick evals (not running files)
  /^\s*python\s+-c\b/, // quick evals
  /^\s*bash\s+scripts\/test\//, // running existing test scripts
  /^\s*node\s+scripts\/test\//, // running JS test scripts
  /^\s*node\s+setup\.js\s+--test/, // hook-runner tests
  /python\s+.*new.session\.py/, // T384: session management (launch new Claude tab)
  /python\s+.*context.reset\.py/, // T384: session management (backward-compat alias)
  /^\s*curl\s/, // HTTP requests (read-only, no local state change)
];

// T338: Default-deny. If a Bash command is NOT in the allowlist above,
// it requires spec chain. This catches cp, mv, sed, tee, redirects,
// build commands, deploy commands — everything that modifies state.

module.exports = function(input) {
  var tool = input.tool_name;
  var isBash = (tool === "Bash");
  if (tool !== "Edit" && tool !== "Write" && !isBash) return null;

  // For Bash: extract and check command
  if (isBash) {
    var bashInput = input.tool_input;
    if (typeof bashInput === "string") { try { bashInput = JSON.parse(bashInput); } catch(e) { bashInput = {}; } }
    var cmd = ((bashInput || {}).command || "").trim();
    if (!cmd) return null;

    // Strip leading cd ... && or cd ... ; to get the real command
    var realCmd = cmd.replace(/^(\s*cd\s+[^;&|]+\s*&&\s*)+/, "").trim();
    // Strip leading env var assignments (e.g. GH_TOKEN=... git pull)
    realCmd = realCmd.replace(/^(\s*\w+=\S*\s+)+/, "").trim();
    // Also handle piped commands — check the first command in the pipeline
    var firstCmd = realCmd.split("|")[0].trim();

    // Check allowlist first
    for (var bai = 0; bai < BASH_ALLOW_PATTERNS.length; bai++) {
      if (BASH_ALLOW_PATTERNS[bai].test(firstCmd)) return null;
    }

    // Default-deny: not in allowlist → requires spec chain
    // Falls through to spec chain check below
  }

  var targetFile = "";
  if (!isBash) {
    try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
    if (!targetFile) return null;
  }
  var norm = isBash ? "" : targetFile.replace(/\\/g, "/");

  // For Bash, skip file-based checks — go straight to spec chain verification
  var isTestFile = false;
  if (!isBash) {
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
    isTestFile = /[\/\\]tests?[\/\\]|scripts\/test\/|\.test\.[jt]s$|\.spec\.[jt]s$|_test\.py$|test_.*\.py$/.test(norm);

    // Allow user home config
    var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
    if (home && norm.indexOf(home + "/.claude/") === 0) return null;
  }

  // Find project root(s)
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var roots = [];
  if (projectDir) roots.push(projectDir);

  if (!isBash && targetFile) {
    var fileGitRoot = findGitRoot(path.dirname(targetFile));
    if (fileGitRoot && roots.indexOf(fileGitRoot) === -1) roots.push(fileGitRoot);
  }
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
  var taskId = branchTaskId(branch); // T321: e.g. "T319"

  // T321: If branch has a task ID, verify that specific task is unchecked somewhere.
  // This prevents edits to production code when the branch task is already done
  // or doesn't exist as an actual task.
  // T374: Also track WHERE the task was found (spec dir name or "TODO") so we can
  // use the exact spec instead of fuzzy word matching later.
  var taskFoundIn = ""; // "" = not found, "TODO" = in TODO.md, "specs/<dir>" = in a spec
  if (taskId) {
    // Check TODO.md files in all roots (T420: cached with mtime)
    for (var tci = 0; tci < roots.length; tci++) {
      var tPath = path.join(roots[tci], "TODO.md");
      var tCached = cachedTodoRead(tPath);
      if (!tCached) continue;
      if (isTaskUnchecked(tCached.content, taskId)) { taskFoundIn = "TODO"; break; }
    }

    // Check specs/*/tasks.md files in all roots (T420: cached with mtime)
    for (var sci = 0; sci < roots.length; sci++) {
      var sDir = path.join(roots[sci], "specs");
      var sCachedEntries = cachedSpecScan(sDir);
      for (var sdi = 0; sdi < sCachedEntries.length; sdi++) {
        var stPath = path.join(sDir, sCachedEntries[sdi].dir, "tasks.md");
        if (!sCachedEntries[sdi].hasTasks) continue;
        var stContent = cachedReadFile(stPath);
        if (stContent && isTaskUnchecked(stContent, taskId)) { taskFoundIn = "specs/" + sCachedEntries[sdi].dir; break; }
      }
      if (taskFoundIn.indexOf("specs/") === 0) break;
    }

    if (!taskFoundIn) {
      return {
        decision: "block",
        reason: "SPEC GATE: Branch task " + taskId + " is not an unchecked task in TODO.md or specs/*/tasks.md.\n" +
          "WHY: Your branch '" + branch + "' references " + taskId + " but that task is either\n" +
          "already completed, doesn't exist, or isn't in a task file.\n" +
          "FIX: Add `- [ ] " + taskId + ": description` to TODO.md or specs/*/tasks.md" +
          SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
          "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
      };
    }
  }

  // Scan all spec directories across roots (T420: cached with mtime)
  // Collect: { dir, hasSpec, hasTasks, hasUnchecked, matchScore }
  var specEntries = [];
  for (var ri = 0; ri < roots.length; ri++) {
    var specsDir = path.join(roots[ri], "specs");
    var cachedEntries = cachedSpecScan(specsDir);
    for (var j = 0; j < cachedEntries.length; j++) {
      specEntries.push({
        dir: cachedEntries[j].dir,
        hasSpec: cachedEntries[j].hasSpec,
        hasTasks: cachedEntries[j].hasTasks,
        hasUnchecked: cachedEntries[j].hasUnchecked,
        score: matchScore(cachedEntries[j].dir, featureWords),
      });
    }
  }

  // Also check TODO.md as a fallback task source (T420: cached with mtime)
  var hasTodoUnchecked = false;
  for (var ti = 0; ti < roots.length; ti++) {
    var todoPath = path.join(roots[ti], "TODO.md");
    var todoCached = cachedTodoRead(todoPath);
    if (todoCached && todoCached.hasUnchecked) {
      hasTodoUnchecked = true;
      break;
    }
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
        "  OR: Add `- [ ] TXXX: description` entries to TODO.md" +
        SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
        "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
    };
  }

  // T374: If taskId was found in a specific spec, use that spec directly (skip fuzzy)
  // If taskId was found only in TODO.md, skip fuzzy spec matching entirely
  if (taskFoundIn && taskFoundIn.indexOf("specs/") === 0) {
    var taskSpecDir = taskFoundIn.slice(6); // "specs/foo" → "foo"
    var taskSpecMatch = null;
    for (var tsi = 0; tsi < specEntries.length; tsi++) {
      if (specEntries[tsi].dir === taskSpecDir) { taskSpecMatch = specEntries[tsi]; break; }
    }
    if (taskSpecMatch) {
      // Task ID matched this spec — enforce its chain (it has unchecked tasks by definition)
      if (isTestFile) return null;
      return null;
    }
  }
  if (taskFoundIn === "TODO") {
    // Task is in TODO.md, not in any spec — skip fuzzy spec matching
    // (fuzzy could match the wrong spec and block on its completed tasks)
    if (isTestFile) return null;
    return null;
  }

  // If branch matches a spec dir, enforce THAT spec's chain specifically
  if (featureWords.length > 0 && specEntries.length > 0) {
    // Find best matching spec via fuzzy word matching (only when no taskId match)
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
            "FIX: Create specs/" + bestMatch.dir + "/spec.md with /speckit.specify" +
            SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
            "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
        };
      }
      if (!bestMatch.hasTasks) {
        return {
          decision: "block",
          reason: "SPEC GATE: specs/" + bestMatch.dir + "/tasks.md missing.\n" +
            "WHY: Spec exists but no tasks. The SHTD pipeline is: spec → tasks → code.\n" +
            "FIX: Create tasks with /speckit.tasks from specs/" + bestMatch.dir + "/spec.md" +
            SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
            "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
        };
      }
      if (!bestMatch.hasUnchecked) {
        return {
          decision: "block",
          reason: "SPEC GATE: All tasks in specs/" + bestMatch.dir + "/tasks.md are checked off.\n" +
            "WHY: No open tasks remain for this feature. Either add new tasks or start a new spec.\n" +
            "FIX: Add unchecked tasks to specs/" + bestMatch.dir + "/tasks.md or TODO.md" +
            SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
            "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
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

  // T340: TODO.md with unchecked tasks counts as a valid chain, BUT:
  // On main/master in projects WITH specs/, require a feature branch.
  // TODO.md alone is too permissive — any open task allows editing any file.
  // Feature branches have T321 enforcement (task ID must be unchecked).
  var isMainBranch = !branch || branch === "main" || branch === "master" || branch === "HEAD";
  var hasSpecsDir = specEntries.length > 0;
  if (hasTodoUnchecked) {
    if (isMainBranch && hasSpecsDir) {
      // Mature project on main — require feature branch for traceability
      return {
        decision: "block",
        reason: "SPEC GATE: On main branch — create a feature branch for your task.\n" +
          "WHY: TODO.md has open tasks, but editing on main without a feature branch\n" +
          "means changes can't be traced to a specific task. This project has specs/,\n" +
          "so every change should be on a branch like: 213-T340-fix-spec-gate\n" +
          "FIX: git checkout -b <number>-<task>-<description>\n" +
          "  e.g.: git checkout -b 213-T340-spec-gate-todo-fallback\n" +
          "  The branch name must include TXXX matching an unchecked task." +
          SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
          "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
      };
    }
    // Simple project (no specs/) — TODO.md is sufficient
    anyFullChain = true;
  }

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
        "  OR: Add `- [ ] TXXX: description` entries to TODO.md" +
        SPEC_BEFORE_CODE + CROSS_PROJECT_HINT + "\n" +
        "Blocked: " + (isBash ? "Bash: " + (cmd || "").substring(0, 80) : path.basename(targetFile))
    };
  }

  return null;
};
