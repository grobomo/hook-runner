#!/usr/bin/env node
"use strict";
// T785+T812: Comprehensive audit of all gate modules and stop rules.
// Checks metadata compliance, test coverage, live deployment status,
// architecture compliance (T812), and generates a report.
//
// Usage:
//   node scripts/audit-gates.js             # full text report
//   node scripts/audit-gates.js --json      # machine-readable JSON
//   node scripts/audit-gates.js --summary   # summary stats only
//   node scripts/audit-gates.js --report    # write docs/gate-audit/audit-results.md

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var HOME = process.env.HOME || process.env.USERPROFILE || "";
var LIVE_DIR = path.join(HOME, ".claude", "hooks", "run-modules");
var RULES_DIR = path.join(ROOT, "rules", "stop");
var TESTS_DIR = path.join(ROOT, "scripts", "test");

var args = process.argv.slice(2);
var jsonMode = args.includes("--json");
var summaryMode = args.includes("--summary");
var reportMode = args.includes("--report");

var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var WF_CONFIG_PATH = path.join(HOME, ".claude", "hooks", "workflow-config.json");

// --- Helpers ---

function readFile(p) {
  try { return fs.readFileSync(p, "utf-8"); } catch (e) { return null; }
}

function listFiles(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter(function(f) { return f.endsWith(ext || ".js"); })
      .sort();
  } catch (e) { return []; }
}

function listFilesRecursive(dir, ext) {
  var results = [];
  try {
    var items = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
      var full = path.join(dir, items[i].name);
      if (items[i].isDirectory()) {
        if (items[i].name === "archive" || items[i].name === "_disabled") continue;
        results = results.concat(listFilesRecursive(full, ext));
      } else if (items[i].name.endsWith(ext || ".js")) {
        results.push(full);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

// --- Module audit ---

function auditModule(filePath, event) {
  var content = readFile(filePath);
  if (!content) return null;

  var basename = path.basename(filePath);
  var isHelper = basename.startsWith("_");
  var lines = content.split("\n");
  var lineCount = lines.length;

  // Parse metadata
  var hasWhy = /\/\/\s*WHY:/.test(content);
  var hasTools = /\/\/\s*TOOLS:/.test(content);
  var hasWorkflow = /\/\/\s*WORKFLOW:/.test(content);
  var hasBlocking = /\/\/\s*BLOCKING:/.test(content);
  var hasIncidentHistory = /INCIDENT HISTORY/i.test(content);
  var hasLogging = /hook-log\.jsonl|appendFileSync.*LOG_PATH/i.test(content);
  var hasFalsePositive = /FALSE POSITIVE/i.test(content);
  var hasBlockDecision = /decision.*["']block["']/i.test(content);
  var hasTestMode = /HOOK_RUNNER_TEST/.test(content);

  // Extract WHY text
  var whyMatch = content.match(/\/\/\s*WHY:\s*(.+)/);
  var whyText = whyMatch ? whyMatch[1].trim() : "";

  // Extract WORKFLOW
  var wfMatch = content.match(/\/\/\s*WORKFLOW:\s*(.+)/);
  var workflow = wfMatch ? wfMatch[1].trim() : "";

  // Extract TOOLS
  var toolsMatch = content.match(/\/\/\s*TOOLS:\s*(.+)/);
  var tools = toolsMatch ? toolsMatch[1].trim() : "";

  // Check test coverage — match by filename or by require() reference inside test files
  var nameNoExt = basename.replace(/\.js$/, "");
  var hasTest = false;
  var testFiles = listFiles(TESTS_DIR, ".js").concat(listFiles(TESTS_DIR, ".sh"));
  for (var t = 0; t < testFiles.length; t++) {
    // Direct name match (e.g., test-force-push-gate.js for force-push-gate.js)
    if (testFiles[t].indexOf(nameNoExt) !== -1) {
      hasTest = true;
      break;
    }
  }
  // If no direct match, check test file contents for require() references
  if (!hasTest) {
    for (var t2 = 0; t2 < testFiles.length; t2++) {
      if (!testFiles[t2].endsWith(".js")) continue;
      var testContent = readFile(path.join(TESTS_DIR, testFiles[t2]));
      if (testContent && testContent.indexOf(nameNoExt) !== -1) {
        hasTest = true;
        break;
      }
    }
  }

  // Check if deployed live
  var liveDir = path.join(LIVE_DIR, event);
  var isLive = false;
  try {
    // Check direct and subdirectories
    var livePath = path.join(liveDir, basename);
    if (fs.existsSync(livePath)) {
      isLive = true;
    } else {
      // Check subdirectories (e.g., Stop/1-haiku/, Stop/2-mechanical/)
      var subDirs = fs.readdirSync(liveDir).filter(function(d) {
        return fs.statSync(path.join(liveDir, d)).isDirectory();
      });
      for (var s = 0; s < subDirs.length; s++) {
        if (fs.existsSync(path.join(liveDir, subDirs[s], basename))) {
          isLive = true;
          break;
        }
      }
    }
  } catch (e) { /* skip */ }

  // T812: Rule type classification (mechanical vs haiku)
  var usesHaiku = /haiku-client|haiku-judge|_haiku-judge|\/judge|\/ask|llm-token-tracker|:4100/.test(content);
  var ruleType = usesHaiku ? "haiku" : "mechanical";

  // T812: Event placement correctness
  var placementIssues = [];
  if (event === "PostToolUse" && hasBlockDecision) {
    placementIssues.push("PostToolUse module blocks — should be PreToolUse or non-blocking warning");
  }
  if (event === "UserPromptSubmit" && hasBlockDecision) {
    placementIssues.push("UPS module blocks — UPS must never block (locks user out)");
  }

  // T812: Inversion pattern — module goes permissive when prerequisite missing
  var inversionPatterns = [
    /if\s*\(!.*exist/i,  // if (!file exists) return null
    /catch\s*\(.*\)\s*\{[\s\S]*?return\s+null/m,  // catch errors → pass through
    /!fs\.existsSync.*return\s+null/,  // missing file → allow
  ];
  var hasInversion = false;
  // Check for the specific T794 pattern: missing prerequisite → allow instead of block
  if (/return\s+null.*\/\/.*not found|return\s+null.*\/\/.*missing|return\s+null.*\/\/.*skip/i.test(content)) {
    hasInversion = true;
  }

  // T812: Workflow tag validation
  var workflowIssue = null;
  if (workflow) {
    var wfNames = workflow.split(/\s*,\s*/);
    try {
      var wfConfig = JSON.parse(fs.readFileSync(WF_CONFIG_PATH, "utf-8"));
      var activeWfs = Object.keys(wfConfig).filter(function(k) {
        var v = wfConfig[k];
        return v === true || (v && v.enabled);
      });
      for (var w = 0; w < wfNames.length; w++) {
        if (activeWfs.indexOf(wfNames[w]) === -1) {
          workflowIssue = "workflow '" + wfNames[w] + "' not active in workflow-config.json";
        }
      }
    } catch (e) { /* config not readable — skip */ }
  }

  // Issues
  var issues = [];
  if (!isHelper) {
    if (!hasWhy) issues.push("missing WHY");
    if (!hasTools && event !== "SessionStart") issues.push("missing TOOLS tag");
    if (!hasWorkflow && event !== "SessionStart") issues.push("missing WORKFLOW tag");
    if (!hasIncidentHistory) issues.push("missing INCIDENT HISTORY");
    if (!hasLogging) issues.push("no hook-log.jsonl logging");
    if (hasBlockDecision && !hasFalsePositive) issues.push("blocks without FALSE POSITIVE escape");
    if (!hasTest) issues.push("no test suite");
    // T812 issues
    for (var pi = 0; pi < placementIssues.length; pi++) issues.push(placementIssues[pi]);
    if (hasInversion) issues.push("possible inversion pattern (permissive on missing prerequisite)");
    // workflowIssue is informational — not a real issue (module is intentionally disabled)
  }

  return {
    file: basename,
    event: event,
    isHelper: isHelper,
    lines: lineCount,
    why: whyText,
    workflow: workflow,
    tools: tools,
    ruleType: ruleType,
    metadata: {
      hasWhy: hasWhy,
      hasTools: hasTools,
      hasWorkflow: hasWorkflow,
      hasBlocking: hasBlocking,
      hasIncidentHistory: hasIncidentHistory,
      hasLogging: hasLogging,
      hasFalsePositive: hasFalsePositive,
      hasBlockDecision: hasBlockDecision,
      hasTestMode: hasTestMode,
      usesHaiku: usesHaiku,
      hasInversion: hasInversion
    },
    hasTest: hasTest,
    isLive: isLive,
    issues: issues,
    workflowIssue: workflowIssue
  };
}

// --- Stop rule audit ---

function auditStopRule(filePath) {
  var content = readFile(filePath);
  if (!content) return null;

  var basename = path.basename(filePath);
  var lines = content.split("\n");

  var hasName = /^\s*name:/m.test(content);
  var hasCheck = /^\s*check:/m.test(content);
  var hasAction = /^\s*action:/m.test(content);

  var nameMatch = content.match(/^\s*name:\s*(.+)/m);
  var name = nameMatch ? nameMatch[1].trim() : basename;

  var checkMatch = content.match(/^\s*check:\s*(.+)/m);
  var check = checkMatch ? checkMatch[1].trim().substring(0, 120) : "";

  var issues = [];
  if (!hasName) issues.push("missing name");
  if (!hasCheck) issues.push("missing check");
  if (!hasAction) issues.push("missing action");

  return {
    file: basename,
    name: name,
    check: check,
    lines: lines.length,
    metadata: { hasName: hasName, hasCheck: hasCheck, hasAction: hasAction },
    issues: issues
  };
}

// --- Main ---

var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
var allModules = [];
var allRules = [];

// Audit modules
for (var e = 0; e < events.length; e++) {
  var eventDir = path.join(ROOT, "modules", events[e]);
  var files = listFilesRecursive(eventDir, ".js");
  for (var f = 0; f < files.length; f++) {
    var result = auditModule(files[f], events[e]);
    if (result) allModules.push(result);
  }
}

// Audit stop rules
var ruleFiles = listFiles(RULES_DIR, ".yaml");
for (var r = 0; r < ruleFiles.length; r++) {
  var ruleResult = auditStopRule(path.join(RULES_DIR, ruleFiles[r]));
  if (ruleResult) allRules.push(ruleResult);
}

// T812: Hook-log activity check — which modules have actually fired recently?
var logActivity = {};
try {
  var logContent = readFile(LOG_PATH);
  if (logContent) {
    var logLines = logContent.trim().split("\n");
    // Check last 2000 lines for module names
    var start = Math.max(0, logLines.length - 2000);
    for (var ll = start; ll < logLines.length; ll++) {
      try {
        var entry = JSON.parse(logLines[ll]);
        if (entry.module) {
          logActivity[entry.module] = (logActivity[entry.module] || 0) + 1;
        }
      } catch (e) { /* skip malformed */ }
    }
  }
} catch (e) { /* no log file */ }

// Annotate modules with activity data
for (var la = 0; la < allModules.length; la++) {
  var modName = allModules[la].file.replace(/\.js$/, "");
  allModules[la].logEntries = logActivity[modName] || 0;
  if (allModules[la].isLive && allModules[la].logEntries === 0 && !allModules[la].isHelper) {
    allModules[la].issues.push("deployed but never fired in recent log (possibly broken)");
  }
}

// --- Output ---

if (jsonMode) {
  console.log(JSON.stringify({ modules: allModules, rules: allRules, logActivity: logActivity }, null, 2));
  process.exit(0);
}

// Stats
var totalModules = allModules.filter(function(m) { return !m.isHelper; }).length;
var helpers = allModules.filter(function(m) { return m.isHelper; }).length;
var withIssues = allModules.filter(function(m) { return !m.isHelper && m.issues.length > 0; }).length;
var withTests = allModules.filter(function(m) { return !m.isHelper && m.hasTest; }).length;
var liveDeploy = allModules.filter(function(m) { return !m.isHelper && m.isLive; }).length;
var withLogging = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasLogging; }).length;
var withFP = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasBlockDecision && m.metadata.hasFalsePositive; }).length;
var blockers = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasBlockDecision; }).length;
var withIncident = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasIncidentHistory; }).length;
// T812 stats
var mechanical = allModules.filter(function(m) { return !m.isHelper && m.ruleType === "mechanical"; }).length;
var haikuMods = allModules.filter(function(m) { return !m.isHelper && m.ruleType === "haiku"; }).length;
var inversions = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasInversion; }).length;
var neverFired = allModules.filter(function(m) { return !m.isHelper && m.isLive && m.logEntries === 0; }).length;
var postBlockers = allModules.filter(function(m) { return !m.isHelper && m.event === "PostToolUse" && m.metadata.hasBlockDecision; }).length;

// Build output lines
var out = [];
function emit(s) { out.push(s || ""); }

emit("=== T812: Gate Architecture Audit Report ===");
emit("Generated: " + new Date().toISOString().slice(0, 16));
emit("");
emit("## Module Summary");
emit("  Total modules: " + totalModules + " (+ " + helpers + " helpers)");
emit("  With issues:   " + withIssues + "/" + totalModules);
emit("  With tests:    " + withTests + "/" + totalModules);
emit("  Live deployed: " + liveDeploy + "/" + totalModules);
emit("  With logging:  " + withLogging + "/" + totalModules);
emit("  Incident hist: " + withIncident + "/" + totalModules);
emit("  FP escape:     " + withFP + "/" + blockers + " blocking gates");
emit("");
emit("## Architecture Compliance (T812)");
emit("  Mechanical:    " + mechanical + "/" + totalModules);
emit("  Haiku-powered: " + haikuMods + "/" + totalModules);
emit("  Inversions:    " + inversions + " modules (permissive on missing prerequisite)");
emit("  Never fired:   " + neverFired + " live modules with 0 log entries");
emit("  PostToolUse blockers: " + postBlockers + " (should be 0 — PostToolUse must never block)");
emit("");

// Per-event breakdown
for (var ev = 0; ev < events.length; ev++) {
  var evMods = allModules.filter(function(m) { return m.event === events[ev] && !m.isHelper; });
  if (evMods.length === 0) continue;
  var evIssues = evMods.filter(function(m) { return m.issues.length > 0; });
  var evMech = evMods.filter(function(m) { return m.ruleType === "mechanical"; }).length;
  var evHaiku = evMods.filter(function(m) { return m.ruleType === "haiku"; }).length;
  emit("## " + events[ev] + " (" + evMods.length + " modules: " + evMech + " mechanical, " + evHaiku + " haiku, " + evIssues.length + " with issues)");

  if (!summaryMode) {
    for (var em = 0; em < evMods.length; em++) {
      var m = evMods[em];
      var status = m.issues.length === 0 ? "OK" : "ISSUES";
      var flags = [];
      if (!m.hasTest) flags.push("no-test");
      if (!m.isLive) flags.push("not-live");
      if (!m.metadata.hasLogging) flags.push("no-log");
      if (!m.metadata.hasIncidentHistory) flags.push("no-incident");
      if (m.metadata.hasBlockDecision && !m.metadata.hasFalsePositive) flags.push("no-FP-escape");
      if (m.ruleType === "haiku") flags.push("haiku");
      if (m.metadata.hasInversion) flags.push("inversion");
      if (m.isLive && m.logEntries === 0) flags.push("never-fired");

      var line = "  " + (status === "OK" ? "  " : "! ") + m.file;
      if (flags.length > 0) line += "  [" + flags.join(", ") + "]";
      emit(line);
    }
  }
  emit("");
}

// Stop rules
var ruleIssues = allRules.filter(function(r) { return r.issues.length > 0; });
emit("## Stop Rules (" + allRules.length + " rules, " + ruleIssues.length + " with issues)");
if (!summaryMode) {
  for (var ri = 0; ri < allRules.length; ri++) {
    var rule = allRules[ri];
    var rStatus = rule.issues.length === 0 ? "  " : "! ";
    emit("  " + rStatus + rule.file + " — " + rule.name);
    if (rule.issues.length > 0) {
      emit("    Issues: " + rule.issues.join(", "));
    }
  }
}
emit("");

// Top issues
if (!summaryMode) {
  var issueCounts = {};
  for (var ic = 0; ic < allModules.length; ic++) {
    if (allModules[ic].isHelper) continue;
    for (var ii = 0; ii < allModules[ic].issues.length; ii++) {
      var issue = allModules[ic].issues[ii];
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  emit("## Top Issues");
  var issueList = Object.keys(issueCounts).sort(function(a, b) { return issueCounts[b] - issueCounts[a]; });
  for (var il = 0; il < issueList.length; il++) {
    emit("  " + issueCounts[issueList[il]] + "x " + issueList[il]);
  }

  // List modules missing tests
  emit("");
  emit("## Modules Without Tests");
  var noTest = allModules.filter(function(m) { return !m.isHelper && !m.hasTest; });
  for (var nt = 0; nt < noTest.length; nt++) {
    emit("  " + noTest[nt].event + "/" + noTest[nt].file);
  }

  // T812: Architecture violations
  emit("");
  emit("## Architecture Violations (T812)");

  // PostToolUse blockers
  var ptBlockers = allModules.filter(function(m) { return !m.isHelper && m.event === "PostToolUse" && m.metadata.hasBlockDecision; });
  if (ptBlockers.length > 0) {
    emit("### PostToolUse modules that block (should be non-blocking)");
    for (var pb = 0; pb < ptBlockers.length; pb++) {
      emit("  ! " + ptBlockers[pb].file + "  — move to PreToolUse or convert to warning");
    }
  } else {
    emit("  No PostToolUse blockers (good)");
  }

  // Inversion patterns
  var invMods = allModules.filter(function(m) { return !m.isHelper && m.metadata.hasInversion; });
  if (invMods.length > 0) {
    emit("");
    emit("### Inversion patterns (permissive when prerequisite missing)");
    for (var iv = 0; iv < invMods.length; iv++) {
      emit("  ? " + invMods[iv].event + "/" + invMods[iv].file);
    }
  }

  // Never-fired modules
  var nfMods = allModules.filter(function(m) { return !m.isHelper && m.isLive && m.logEntries === 0; });
  if (nfMods.length > 0) {
    emit("");
    emit("### Deployed but never fired (possibly broken)");
    for (var nf = 0; nf < nfMods.length; nf++) {
      emit("  ? " + nfMods[nf].event + "/" + nfMods[nf].file);
    }
  }
}

// Output all lines
var output = out.join("\n");
console.log(output);

// Write report file if --report
if (reportMode) {
  var reportDir = path.join(ROOT, "docs", "gate-audit");
  try { fs.mkdirSync(reportDir, { recursive: true }); } catch (e) {}
  var reportPath = path.join(reportDir, "audit-results.md");
  fs.writeFileSync(reportPath, "# Gate Architecture Audit Results\n\n" + output + "\n");
  console.log("\nReport written to: " + reportPath);
}
