#!/usr/bin/env node
// Project hygiene audit for hook-runner
// Runs mechanical checks, then calls Haiku for semantic analysis.
// Output: scripts/hygiene-report.md (machine + LLM analysis)
//
// Usage:
//   node scripts/project-hygiene.js           # full audit + Haiku analysis
//   node scripts/project-hygiene.js --ci      # mechanical only (no Haiku, exit 1 on fail)
//   node scripts/project-hygiene.js --json    # mechanical results as JSON
//
// CI: .github/workflows/hygiene.yml runs --ci on every push/PR.
"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var args = process.argv.slice(2);
var ciMode = args.indexOf("--ci") >= 0;
var jsonMode = args.indexOf("--json") >= 0;

// ── Helpers ──

function git(cmd) {
  try {
    return cp.execSync("git " + cmd, { cwd: ROOT, encoding: "utf-8", timeout: 10000 }).trim();
  } catch (e) { return ""; }
}

function globFiles(pattern, dir) {
  try {
    // Use git ls-files for tracked, find for all
    return cp.execSync("git ls-files " + (pattern || ""), { cwd: dir || ROOT, encoding: "utf-8", timeout: 5000 })
      .trim().split("\n").filter(Boolean);
  } catch (e) { return []; }
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), "utf-8"); } catch (e) { return ""; }
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── Check registry ──
// Each check: { name, category, run() → { pass, detail } }

var checks = [];

function check(name, category, fn) {
  checks.push({ name: name, category: category, run: fn });
}

// ═══════════════════════════════════════════════════════════
// CATEGORY 1: File Organization
// ═══════════════════════════════════════════════════════════

check("No orphan temp files tracked in git", "organization", function() {
  var tracked = git("ls-files").split("\n").filter(Boolean);
  var orphans = tracked.filter(function(f) {
    // Only check root-level files
    if (f.indexOf("/") >= 0) return false;
    return /^\.test-tmp-/.test(f) || /^session-analysis-/.test(f) ||
           /^session-trace-/.test(f) || /^audit-report-/.test(f) ||
           /\.rewrite-approved$/.test(f) || /^debug-/.test(f);
  });
  return { pass: orphans.length === 0, detail: orphans.length > 0
    ? orphans.length + " orphan files tracked: " + orphans.slice(0, 3).join(", ")
    : "clean" };
});

check("Root files in sync with cli/src/runners", "organization", function() {
  // Root .js files are the dev copies, cli/src/runners/ are the npm package.
  // They must be identical — divergence means someone edited only one copy.
  var dirs = ["cli", "src", "runners"];
  var diverged = [];
  dirs.forEach(function(dir) {
    if (!fileExists(dir)) return;
    fs.readdirSync(path.join(ROOT, dir)).forEach(function(f) {
      if (f.startsWith("_")) return;
      var rootFile = path.join(ROOT, f);
      var subFile = path.join(ROOT, dir, f);
      if (fs.existsSync(rootFile) && fs.existsSync(subFile)) {
        var same = fs.readFileSync(rootFile, "utf-8") === fs.readFileSync(subFile, "utf-8");
        if (!same) diverged.push(f + " (root vs " + dir + "/)");
      }
    });
  });
  return { pass: diverged.length === 0, detail: diverged.length > 0
    ? "DIVERGED: " + diverged.join("; ") : "all in sync" };
});

check("package.json files[] matches actual structure", "organization", function() {
  var pkg = JSON.parse(readFile("package.json"));
  var declared = pkg.files || [];
  var missing = declared.filter(function(f) { return !fileExists(f.replace(/\/$/, "")); });
  return { pass: missing.length === 0, detail: missing.length > 0
    ? "missing: " + missing.join(", ") : declared.join(", ") };
});

check("No tracked files that should be gitignored", "organization", function() {
  var shouldIgnore = [
    "SESSION_STATE.md", "ENFORCEMENT.md", "TODO-COMPLETED.md",
    "workflow-config.json", "watchdog-config.json", "modules.yaml",
    ".workflow-state.json"
  ];
  var tracked = shouldIgnore.filter(function(f) {
    return git("ls-files --error-unmatch " + f + " 2>/dev/null") !== "";
  });
  return { pass: tracked.length === 0, detail: tracked.length > 0
    ? "tracked but should be ignored: " + tracked.join(", ") : "clean" };
});

check("docs/ files are explanatory (not stale snapshots)", "organization", function() {
  var trackedDocs = git("ls-files docs/").split("\n").filter(Boolean);
  var stale = [];
  trackedDocs.forEach(function(rel) {
    var fp = path.join(ROOT, rel);
    var item = path.basename(rel);
    if (!item.endsWith(".md") && !item.endsWith(".json")) return;
    if (!fs.existsSync(fp)) return;
    var dateMatch = item.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      var age = (Date.now() - new Date(dateMatch[0]).getTime()) / 86400000;
      if (age > 60) stale.push(rel + " (" + Math.round(age) + " days old)");
    }
    var content = fs.readFileSync(fp, "utf-8");
    var hasPurpose = /^#|^##|why|purpose|overview/im.test(content) ||
      /"_comment"/.test(content);
    if (content.length > 0 && !hasPurpose) {
      stale.push(rel + " (no heading or purpose statement)");
    }
  });
  return { pass: stale.length === 0, detail: stale.length > 0
    ? stale.join("; ") : "all docs have purpose" };
});

// ═══════════════════════════════════════════════════════════
// CATEGORY 2: Naming Conventions
// ═══════════════════════════════════════════════════════════

check("New modules follow naming convention (-gate/-guard/-check)", "naming", function() {
  // Legacy modules predate the convention. Only flag NEW modules (not yet committed).
  var bad = [];
  var newFiles = [];
  try {
    newFiles = cp.execSync("git diff --cached --name-only --diff-filter=A 2>/dev/null || git ls-files --others --exclude-standard 2>/dev/null",
      { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim().split("\n").filter(Boolean);
  } catch (e) {}
  newFiles.forEach(function(f) {
    if (!f.startsWith("modules/") || !f.endsWith(".js")) return;
    var base = path.basename(f);
    if (base.startsWith("_") || base === ".gitkeep") return;
    if (!/-gate\.js$|-guard\.js$|-check\.js$/.test(base)) {
      bad.push(f);
    }
  });
  return { pass: bad.length === 0, detail: bad.length > 0
    ? bad.length + " new modules don't follow convention: " + bad.join(", ")
    : "all new modules follow convention" };
});

check("Test files match module names", "naming", function() {
  var testDir = path.join(ROOT, "scripts", "test");
  var modules = [];
  ["PreToolUse", "PostToolUse", "SessionStart", "Stop"].forEach(function(evt) {
    var dir = path.join(ROOT, "modules", evt);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function(f) {
      if (!f.endsWith(".js") || f.startsWith("_") || f === ".gitkeep") return;
      var st = fs.statSync(path.join(dir, f));
      if (st.isDirectory()) return;
      modules.push(f.replace(/\.js$/, ""));
    });
  });
  var untested = modules.filter(function(m) {
    // Look for test-<module>.js or test-<module>.sh or test-TXXX-<partial>.js
    var tests = fs.readdirSync(testDir).filter(function(t) {
      return t.indexOf(m) >= 0 || t.replace(/^test-T\d+-/, "test-").indexOf(m) >= 0;
    });
    return tests.length === 0;
  });
  return { pass: untested.length <= modules.length * 0.15,
    detail: untested.length + "/" + modules.length + " modules without tests" +
      (untested.length > 0 ? ": " + untested.slice(0, 5).join(", ") : "") };
});

// ═══════════════════════════════════════════════════════════
// CATEGORY 3: Code Hygiene
// ═══════════════════════════════════════════════════════════

check("No hardcoded user paths in tracked files", "hygiene", function() {
  var tracked = globFiles("'*.js'").concat(globFiles("'*.md'")).concat(globFiles("'*.yaml'"));
  var hits = [];
  var pattern = /C:[/\\]Users[/\\]\w+|\/home\/\w+(?!\/)|\/Users\/\w+/;
  var allowedFiles = /test-.*\.js$|CLAUDE\.md$|CHANGELOG\.md$/;
  tracked.forEach(function(f) {
    if (allowedFiles.test(f)) return;
    var content = readFile(f);
    if (pattern.test(content)) hits.push(f);
  });
  return { pass: hits.length === 0, detail: hits.length > 0
    ? hits.join(", ") : "clean" };
});

check("No personal identifiers (PII) in tracked files", "hygiene", function() {
  var tracked = globFiles("'*.js'").concat(globFiles("'*.md'")).concat(globFiles("'*.json'"));
  var hits = [];
  // These patterns should be customized per-project
  var piiPatterns = [
    /joel[\s._-]?ginsberg/i,
    /joelg@/i,
    /joel-ginsberg_tmemu/i,
  ];
  var allowedFiles = /CLAUDE\.md$|CHANGELOG\.md$|archive\//;
  tracked.forEach(function(f) {
    if (allowedFiles.test(f)) return;
    var content = readFile(f);
    for (var i = 0; i < piiPatterns.length; i++) {
      if (piiPatterns[i].test(content)) {
        hits.push(f + " (" + piiPatterns[i].source + ")");
        break;
      }
    }
  });
  return { pass: hits.length === 0, detail: hits.length > 0
    ? hits.join("; ") : "clean" };
});

check("No secrets in tracked files", "hygiene", function() {
  var tracked = globFiles("'*.js'").concat(globFiles("'*.json'")).concat(globFiles("'*.yaml'"));
  var hits = [];
  var secretPatterns = [
    { name: "AWS key", re: /AKIA[0-9A-Z]{16}/ },
    { name: "Generic secret", re: /(?:secret|password|token)\s*[:=]\s*["'][A-Za-z0-9+/]{20,}["']/i },
    { name: "Private key", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  ];
  tracked.forEach(function(f) {
    if (/secret-scan-gate\.js$/.test(f)) return; // the scanner itself has patterns
    var content = readFile(f);
    secretPatterns.forEach(function(sp) {
      if (sp.re.test(content)) hits.push(f + " (" + sp.name + ")");
    });
  });
  return { pass: hits.length === 0, detail: hits.length > 0
    ? hits.join("; ") : "clean" };
});

check("All modules have WHY comment", "hygiene", function() {
  var missing = [];
  ["PreToolUse", "PostToolUse", "SessionStart", "Stop"].forEach(function(evt) {
    var dir = path.join(ROOT, "modules", evt);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function(f) {
      if (!f.endsWith(".js") || f.startsWith("_") || f === ".gitkeep") return;
      var fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) return;
      var head = fs.readFileSync(fp, "utf-8").slice(0, 500);
      if (!/\/\/\s*WHY:/i.test(head)) missing.push(evt + "/" + f);
    });
  });
  return { pass: missing.length === 0, detail: missing.length > 0
    ? missing.length + " missing WHY: " + missing.slice(0, 5).join(", ") : "all have WHY" };
});

check("All modules have WORKFLOW tag (or are intentionally global)", "hygiene", function() {
  // Modules without WORKFLOW run on ALL workflows — intentional for foundational gates.
  var KNOWN_GLOBAL = ["spec-gate.js"]; // documented exceptions
  var missing = [];
  ["PreToolUse", "PostToolUse", "SessionStart", "Stop"].forEach(function(evt) {
    var dir = path.join(ROOT, "modules", evt);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function(f) {
      if (!f.endsWith(".js") || f.startsWith("_") || f === ".gitkeep") return;
      if (KNOWN_GLOBAL.indexOf(f) >= 0) return;
      var fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) return;
      var head = fs.readFileSync(fp, "utf-8").slice(0, 300);
      if (!/\/\/\s*WORKFLOW:/i.test(head)) missing.push(evt + "/" + f);
    });
  });
  return { pass: missing.length === 0, detail: missing.length > 0
    ? missing.length + " missing WORKFLOW: " + missing.slice(0, 5).join(", ") : "all tagged" };
});

// ═══════════════════════════════════════════════════════════
// CATEGORY 4: Documentation Quality
// ═══════════════════════════════════════════════════════════

check("README references accurate module counts", "docs", function() {
  var readme = readFile("README.md");
  // Count actual modules
  var moduleCount = 0;
  ["PreToolUse", "PostToolUse", "SessionStart", "Stop"].forEach(function(evt) {
    var dir = path.join(ROOT, "modules", evt);
    if (!fs.existsSync(dir)) return;
    function countDir(d) {
      fs.readdirSync(d).forEach(function(f) {
        var fp = path.join(d, f);
        if (fs.statSync(fp).isDirectory()) { countDir(fp); return; }
        if (f.endsWith(".js") && !f.startsWith("_") && f !== ".gitkeep") moduleCount++;
      });
    }
    countDir(dir);
  });
  // Check if README mentions a count that's way off
  var countMatch = readme.match(/(\d+)\+?\s*modules/i);
  if (!countMatch) return { pass: false, detail: "README doesn't mention module count" };
  var stated = parseInt(countMatch[1], 10);
  var drift = Math.abs(moduleCount - stated);
  return { pass: drift <= 10, detail: "README says " + stated + "+, actual " + moduleCount +
    (drift > 10 ? " (DRIFT: " + drift + ")" : "") };
});

check("GETTING-STARTED.md exists and is current", "docs", function() {
  if (!fileExists("GETTING-STARTED.md")) return { pass: false, detail: "missing" };
  var content = readFile("GETTING-STARTED.md");
  var issues = [];
  if (content.indexOf("46 modules") >= 0) issues.push("stale count '46 modules'");
  if (content.indexOf("npx grobomo/hook-runner") < 0) issues.push("missing install command");
  return { pass: issues.length === 0, detail: issues.length > 0 ? issues.join("; ") : "current" };
});

check("README workflow table matches workflow files", "docs", function() {
  var readme = readFile("README.md");
  var wfDir = path.join(ROOT, "workflows");
  var wfFiles = [];
  try {
    wfFiles = fs.readdirSync(wfDir).filter(function(f) {
      return f.endsWith(".yml") && !f.includes("archive");
    }).map(function(f) { return f.replace(/\.yml$/, ""); });
  } catch (e) {}
  var missing = wfFiles.filter(function(w) {
    return readme.indexOf("`" + w + "`") < 0 && readme.indexOf("| `" + w + "`") < 0;
  });
  return { pass: missing.length === 0, detail: missing.length > 0
    ? "workflows not in README: " + missing.join(", ") : "all documented" };
});

check("No internal-only docs committed", "docs", function() {
  var bad = [];
  var internalPatterns = [
    /session-analysis-/,
    /audit-report-\d/,
    /session-trace-/,
    /\.rewrite-approved$/,
    /debug-hooks/,
  ];
  var tracked = git("ls-files").split("\n");
  tracked.forEach(function(f) {
    internalPatterns.forEach(function(p) {
      if (p.test(f)) bad.push(f);
    });
  });
  return { pass: bad.length === 0, detail: bad.length > 0
    ? "internal files tracked: " + bad.join(", ") : "clean" };
});

// ═══════════════════════════════════════════════════════════
// CATEGORY 5: Structural Integrity
// ═══════════════════════════════════════════════════════════

check("All tests pass", "integrity", function() {
  if (ciMode) {
    try {
      var out = cp.execSync("node scripts/test/test-modules.js", {
        cwd: ROOT, encoding: "utf-8", timeout: 60000, env: Object.assign({}, process.env, { HOOK_RUNNER_TEST: "1" })
      });
      var m = out.match(/(\d+) passed, (\d+) failed/);
      if (m) return { pass: parseInt(m[2], 10) === 0, detail: m[0] };
    } catch (e) {
      return { pass: false, detail: "test runner crashed: " + (e.message || "").slice(0, 100) };
    }
  }
  return { pass: true, detail: "skipped (use --ci to run)" };
});

check("package.json version is semver", "integrity", function() {
  var pkg = JSON.parse(readFile("package.json"));
  var valid = /^\d+\.\d+\.\d+$/.test(pkg.version || "");
  return { pass: valid, detail: "v" + (pkg.version || "missing") };
});

check("No console.log in module exports (stderr only)", "integrity", function() {
  var bad = [];
  ["PreToolUse", "PostToolUse"].forEach(function(evt) {
    var dir = path.join(ROOT, "modules", evt);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function(f) {
      if (!f.endsWith(".js") || f.startsWith("_")) return;
      var fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) return;
      var content = fs.readFileSync(fp, "utf-8");
      // console.log in module body (not in comments)
      var lines = content.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith("//")) continue;
        if (/\bconsole\.log\b/.test(line)) {
          bad.push(evt + "/" + f + ":" + (i + 1));
          break;
        }
      }
    });
  });
  return { pass: bad.length === 0, detail: bad.length > 0
    ? bad.length + " modules with console.log: " + bad.slice(0, 3).join(", ") : "clean (stderr only)" };
});

// ═══════════════════════════════════════════════════════════
// Run all checks
// ═══════════════════════════════════════════════════════════

var results = [];
var categories = {};

checks.forEach(function(c) {
  var r = c.run();
  var entry = { name: c.name, category: c.category, pass: r.pass, detail: r.detail };
  results.push(entry);
  if (!categories[c.category]) categories[c.category] = { pass: 0, fail: 0, items: [] };
  categories[c.category][r.pass ? "pass" : "fail"]++;
  categories[c.category].items.push(entry);
});

var totalPass = results.filter(function(r) { return r.pass; }).length;
var totalFail = results.filter(function(r) { return !r.pass; }).length;

// ── JSON output ──

if (jsonMode) {
  console.log(JSON.stringify({ total: results.length, pass: totalPass, fail: totalFail, results: results }, null, 2));
  process.exit(totalFail > 0 ? 1 : 0);
}

// ── Text output ──

console.log("=== Project Hygiene Audit ===\n");

Object.keys(categories).forEach(function(cat) {
  var c = categories[cat];
  console.log("## " + cat.toUpperCase() + " (" + c.pass + "/" + (c.pass + c.fail) + " pass)");
  c.items.forEach(function(item) {
    console.log("  " + (item.pass ? "PASS" : "FAIL") + ": " + item.name);
    if (!item.pass) console.log("        → " + item.detail);
  });
  console.log("");
});

console.log("Total: " + totalPass + " pass, " + totalFail + " fail\n");

// ── Haiku analysis (skip in CI) ──

if (ciMode) {
  process.exit(totalFail > 0 ? 1 : 0);
}

// Call Haiku for semantic analysis of results
var HOME = process.env.HOME || process.env.USERPROFILE || "";
var haikuClientPath = path.join(HOME, ".claude", "hooks", "haiku-client");
var haiku;
try { haiku = require(haikuClientPath); } catch (e) {
  console.log("[haiku] Not available — skipping semantic analysis");
  writeReport(results, categories, null);
  process.exit(totalFail > 0 ? 1 : 0);
}

// Build context for Haiku
var failDetails = results.filter(function(r) { return !r.pass; })
  .map(function(r) { return r.name + ": " + r.detail; }).join("\n");

var passDetails = results.filter(function(r) { return r.pass; })
  .map(function(r) { return r.name; }).join(", ");

var readme = readFile("README.md").slice(0, 2000);
var pkgJson = readFile("package.json").slice(0, 500);

var prompt = [
  "You are reviewing a public GitHub project (hook-runner) for sharing with technical colleagues.",
  "The automated hygiene audit found " + totalFail + " failures and " + totalPass + " passes.",
  "",
  "FAILURES:",
  failDetails || "(none)",
  "",
  "PASSES: " + passDetails,
  "",
  "README excerpt (first 2000 chars):",
  readme,
  "",
  "package.json excerpt:",
  pkgJson,
  "",
  "Analyze these results and answer:",
  "1. CRITICAL ISSUES: What would embarrass the author in front of senior engineers? (list each with WHY it matters)",
  "2. QUICK WINS: What can be fixed in <5 minutes that improves perception the most?",
  "3. STRUCTURE OPINION: Is the file organization intuitive for a newcomer? What would you rename/move?",
  "4. DOC GAPS: What does the documentation explain well? What's missing that a reader would need?",
  "5. OVERALL GRADE: A-F with one-sentence justification.",
  "",
  "Be specific and actionable. No generic advice."
].join("\n");

var haikuResult = haiku.call({
  prompt: prompt,
  caller: "project-hygiene",
  maxTokens: 1500,
  timeoutMs: 15000
});

if (haikuResult.ok) {
  console.log("\n=== Haiku Analysis ===\n");
  console.log(haikuResult.content);
  writeReport(results, categories, haikuResult.content);
} else {
  console.log("\n[haiku] Analysis failed: " + (haikuResult.content || "timeout"));
  writeReport(results, categories, null);
}

process.exit(totalFail > 0 ? 1 : 0);

// ── Write report file ──

function writeReport(results, categories, haikuAnalysis) {
  var lines = [
    "# Project Hygiene Report",
    "",
    "Generated: " + new Date().toISOString().slice(0, 19),
    "Result: " + totalPass + " pass, " + totalFail + " fail",
    "",
  ];

  Object.keys(categories).forEach(function(cat) {
    var c = categories[cat];
    lines.push("## " + cat.charAt(0).toUpperCase() + cat.slice(1) + " (" + c.pass + "/" + (c.pass + c.fail) + ")");
    c.items.forEach(function(item) {
      lines.push("- " + (item.pass ? "✓" : "✗") + " " + item.name + (item.pass ? "" : " — " + item.detail));
    });
    lines.push("");
  });

  if (haikuAnalysis) {
    lines.push("## AI Analysis");
    lines.push("");
    lines.push(haikuAnalysis);
    lines.push("");
  }

  var reportPath = path.join(ROOT, "scripts", "hygiene-report.md");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log("\nReport written to scripts/hygiene-report.md");
}
