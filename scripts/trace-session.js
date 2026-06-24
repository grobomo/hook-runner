#!/usr/bin/env node
// Central session tracer: combines chat transcript + hook-log + haiku decisions
// into one chronological timeline. Identifies gaps, failures, patterns.
// Runs OUTSIDE Claude session — fully automated, not dependent on Opus.
//
// Usage: node scripts/trace-session.js [--report] [--last N minutes]
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var PROJECT_SLUG = process.env.CLAUDE_PROJECT_SLUG ||
  process.cwd().replace(/\\/g, "/").replace(/[/:]/g, "-").replace(/^-+/, "-");
var LOGS_DIR = path.join(HOME, ".claude", "projects", PROJECT_SLUG);

var args = process.argv.slice(2);
var writeReport = args.indexOf("--report") !== -1;
var lastMinutes = 60;
var lastIdx = args.indexOf("--last");
if (lastIdx !== -1 && args[lastIdx + 1]) lastMinutes = parseInt(args[lastIdx + 1]);

var cutoff = Date.now() - (lastMinutes * 60 * 1000);

// === 1. Read chat transcript ===
var chatEvents = [];
try {
  var sessions = fs.readdirSync(LOGS_DIR)
    .filter(function(f) { return f.endsWith(".jsonl") && f !== "session-chain.jsonl"; })
    .map(function(f) { return { name: f, path: path.join(LOGS_DIR, f), mtime: fs.statSync(path.join(LOGS_DIR, f)).mtimeMs }; })
    .sort(function(a, b) { return b.mtime - a.mtime; });

  if (sessions.length > 0) {
    var lines = fs.readFileSync(sessions[0].path, "utf-8").trim().split("\n");
    for (var i = 0; i < lines.length; i++) {
      try {
        var e = JSON.parse(lines[i]);
        var type = e.type || "";
        if (type !== "user" && type !== "assistant") continue;
        var ts = e.timestamp || e.ts || "";
        if (!ts && e.message && e.message.created) ts = new Date(e.message.created * 1000).toISOString();
        var msg = e.message || {};
        var content = msg.content;
        var text = "";
        if (typeof content === "string") text = content.slice(0, 100);
        else if (Array.isArray(content)) {
          var texts = content.filter(function(c) { return c.type === "text"; }).map(function(c) { return c.text || ""; });
          var tools = content.filter(function(c) { return c.type === "tool_use"; }).map(function(c) { return c.name || "?"; });
          text = texts.join(" ").slice(0, 80);
          if (tools.length) text += " [tools: " + tools.join(",") + "]";
        }
        chatEvents.push({ ts: ts, source: "CHAT", type: type.toUpperCase(), text: text });
      } catch (ex) {}
    }
  }
} catch (e) { console.error("Chat read error:", e.message); }

// === 2. Read hook-log ===
var hookEvents = [];
try {
  var hookLines = fs.readFileSync(HOOK_LOG, "utf-8").trim().split("\n");
  for (var h = hookLines.length - 1; h >= 0; h--) {
    try {
      var he = JSON.parse(hookLines[h]);
      if (!he.ts) continue;
      var hts = new Date(he.ts).getTime();
      if (hts < cutoff) break;
      hookEvents.unshift({
        ts: he.ts,
        source: "HOOK",
        type: he.event + "/" + he.module,
        result: he.result,
        text: (he.reason || he.error || "").slice(0, 80)
      });
    } catch (ex) {}
  }
} catch (e) { console.error("Hook log error:", e.message); }

// === 3. Merge and sort chronologically ===
var allEvents = chatEvents.concat(hookEvents).filter(function(e) {
  return e.ts && new Date(e.ts).getTime() >= cutoff;
}).sort(function(a, b) {
  return new Date(a.ts).getTime() - new Date(b.ts).getTime();
});

// === 4. Analyze: find gaps ===
var stopFires = hookEvents.filter(function(e) { return e.type.indexOf("Stop/") !== -1; });
var assistantResponses = chatEvents.filter(function(e) { return e.type === "ASSISTANT"; });
var gaps = [];
var lastStopTs = 0;

for (var ai = 0; ai < assistantResponses.length; ai++) {
  var respTs = new Date(assistantResponses[ai].ts).getTime();
  if (!respTs) continue;
  // Find if a stop fired within 30s after this response
  var foundStop = false;
  for (var si = 0; si < stopFires.length; si++) {
    var stopTs = new Date(stopFires[si].ts).getTime();
    if (stopTs > respTs && stopTs - respTs < 30000) { foundStop = true; break; }
  }
  if (!foundStop && respTs > cutoff) {
    gaps.push({ ts: assistantResponses[ai].ts, text: assistantResponses[ai].text });
  }
}

// === 5. Summary stats ===
var stopBlocks = stopFires.filter(function(e) { return e.result === "block"; });
var stopPasses = stopFires.filter(function(e) { return e.result === "pass" || e.result === "dedup_skip"; });
var stopFails = stopFires.filter(function(e) { return e.result === "haiku_fail" || e.result === "pass_on_error"; });
var mandateBlocks = hookEvents.filter(function(e) { return e.type.indexOf("mandate-gate") !== -1 && e.result === "block"; });

// === 5b. Fix-break cycle detection ===
var fixBreakCycles = [];
var blocksByModule = {};
hookEvents.forEach(function(e) {
  if (e.result === "block") {
    var mod = e.type.split("/").pop() || "unknown";
    if (!blocksByModule[mod]) blocksByModule[mod] = [];
    blocksByModule[mod].push(e);
  }
});
Object.keys(blocksByModule).forEach(function(mod) {
  var blocks = blocksByModule[mod];
  for (var bi = 1; bi < blocks.length; bi++) {
    var gap = new Date(blocks[bi].ts).getTime() - new Date(blocks[bi - 1].ts).getTime();
    if (gap < 120000 && gap > 5000) {
      fixBreakCycles.push({
        module: mod,
        ts1: blocks[bi - 1].ts,
        ts2: blocks[bi].ts,
        gapSec: Math.round(gap / 1000)
      });
    }
  }
});

// === 5c. Frustration signals ===
var frustrations = [];
try {
  var frustLog = path.join(HOME, ".claude", "hooks", "frustration-log.jsonl");
  var frustLines = fs.readFileSync(frustLog, "utf-8").trim().split("\n");
  for (var fi = frustLines.length - 1; fi >= 0; fi--) {
    try {
      var fe = JSON.parse(frustLines[fi]);
      if (fe.ts && new Date(fe.ts).getTime() >= cutoff) {
        frustrations.push(fe);
      } else break;
    } catch (ex) {}
  }
} catch (e) {}

// === 6. Output ===
console.log("=== SESSION TRACE (last " + lastMinutes + " min) ===");
console.log("Chat events: " + chatEvents.length);
console.log("Hook events: " + hookEvents.length);
console.log("Stop fires: " + stopFires.length + " (blocks:" + stopBlocks.length + " passes:" + stopPasses.length + " fails:" + stopFails.length + ")");
console.log("Mandate blocks: " + mandateBlocks.length);
console.log("Response→Stop GAPS (no stop within 30s): " + gaps.length);
console.log("Fix-break cycles: " + fixBreakCycles.length);
console.log("Frustration signals: " + frustrations.length);

if (gaps.length > 0) {
  console.log("\n--- GAPS (responses with no stop hook) ---");
  gaps.slice(-10).forEach(function(g) {
    console.log("  " + (g.ts || "?").slice(11, 19) + " " + g.text);
  });
}

if (fixBreakCycles.length > 0) {
  console.log("\n--- FIX-BREAK CYCLES (same gate blocked twice within 2min) ---");
  fixBreakCycles.slice(-5).forEach(function(c) {
    console.log("  " + c.module + ": " + (c.ts1 || "").slice(11, 19) + " → " + (c.ts2 || "").slice(11, 19) + " (" + c.gapSec + "s)");
  });
}

if (frustrations.length > 0) {
  console.log("\n--- USER FRUSTRATION ---");
  frustrations.slice(-5).forEach(function(f) {
    console.log("  " + (f.ts || "").slice(11, 19) + " [" + f.category + "] " + (f.preview || "").slice(0, 60));
  });
}

console.log("\n--- LAST 20 EVENTS ---");
allEvents.slice(-20).forEach(function(e) {
  var time = (e.ts || "").slice(11, 19);
  var line = time + " [" + e.source + "] " + e.type;
  if (e.result) line += " → " + e.result;
  if (e.text) line += " | " + e.text.slice(0, 60);
  console.log("  " + line);
});

// === 7. Haiku analysis (--analyze flag) ===
var doAnalyze = args.indexOf("--analyze") !== -1;
var haikuAnalysis = "";
if (doAnalyze) {
  try {
    var haiku = require(path.join(HOME, ".claude", "hooks", "haiku-client"));
    var prompt = [
      "Analyze this Claude Code session trace for behavioral problems.",
      "",
      "STATS: " + stopFires.length + " stops (" + stopBlocks.length + " blocks, " + stopFails.length + " failures), " +
        gaps.length + " gaps, " + fixBreakCycles.length + " fix-break cycles, " + frustrations.length + " frustrations",
      "",
      "GAPS (stop hook didn't fire):",
      gaps.slice(-5).map(function(g) { return "  " + (g.ts || "").slice(11, 19) + " " + g.text; }).join("\n") || "  None",
      "",
      "FIX-BREAK CYCLES:",
      fixBreakCycles.slice(-5).map(function(c) { return "  " + c.module + " blocked twice in " + c.gapSec + "s"; }).join("\n") || "  None",
      "",
      "FRUSTRATION SIGNALS:",
      frustrations.slice(-5).map(function(f) { return "  [" + f.category + "] " + (f.preview || "").slice(0, 80); }).join("\n") || "  None",
      "",
      "LAST 10 EVENTS:",
      allEvents.slice(-10).map(function(e) {
        return "  " + (e.ts || "").slice(11, 19) + " " + e.source + "/" + e.type + (e.result ? " → " + e.result : "");
      }).join("\n"),
      "",
      "Respond with JSON: {\"health\":\"good|degraded|broken\", \"issues\":[\"...\"], \"recommendations\":[\"...\"]}"
    ].join("\n");

    var result = haiku.call({
      prompt: prompt,
      caller: "trace-session",
      maxTokens: 500,
      timeoutMs: 15000,
      jsonMode: true
    });

    if (result.ok && result.parsed) {
      haikuAnalysis = JSON.stringify(result.parsed, null, 2);
      console.log("\n--- HAIKU ANALYSIS ---");
      console.log("Health: " + (result.parsed.health || "unknown"));
      if (result.parsed.issues) {
        result.parsed.issues.forEach(function(i) { console.log("  Issue: " + i); });
      }
      if (result.parsed.recommendations) {
        result.parsed.recommendations.forEach(function(r) { console.log("  Fix: " + r); });
      }
    } else if (result.ok) {
      haikuAnalysis = result.content || "";
      console.log("\n--- HAIKU ANALYSIS ---");
      console.log(haikuAnalysis.slice(0, 500));
    } else {
      console.log("\n--- HAIKU ANALYSIS: unavailable (" + (result.error || "timeout") + ") ---");
    }
  } catch (e) {
    console.log("\n--- HAIKU ANALYSIS: error (" + e.message + ") ---");
  }
}

// === 8. Write report ===
if (writeReport || doAnalyze) {
  var reportName = "session-trace-" + new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md";
  var report = [
    "# Session Trace Report",
    "**Generated:** " + new Date().toISOString(),
    "**Window:** last " + lastMinutes + " minutes",
    "",
    "## Stats",
    "- Chat events: " + chatEvents.length,
    "- Hook events: " + hookEvents.length,
    "- Stop fires: " + stopFires.length + " (blocks:" + stopBlocks.length + " passes:" + stopPasses.length + " fails:" + stopFails.length + ")",
    "- Mandate blocks: " + mandateBlocks.length,
    "- **GAPS (no stop after response): " + gaps.length + "**",
    "- Fix-break cycles: " + fixBreakCycles.length,
    "- Frustration signals: " + frustrations.length,
    "",
    "## Gaps (responses where stop hook didn't fire)",
    gaps.map(function(g) { return "- " + (g.ts || "?").slice(11, 19) + " — " + g.text; }).join("\n") || "None",
    "",
    "## Fix-Break Cycles",
    fixBreakCycles.map(function(c) { return "- " + c.module + ": " + (c.ts1 || "").slice(11, 19) + " → " + (c.ts2 || "").slice(11, 19) + " (" + c.gapSec + "s gap)"; }).join("\n") || "None",
    "",
    "## User Frustration",
    frustrations.map(function(f) { return "- " + (f.ts || "").slice(11, 19) + " [" + f.category + "] " + (f.preview || "").slice(0, 80); }).join("\n") || "None",
    "",
    "## Timeline (last 30 events)",
    allEvents.slice(-30).map(function(e) {
      return "- `" + (e.ts || "").slice(11, 19) + "` **" + e.source + "/" + e.type + "**" + (e.result ? " → " + e.result : "") + (e.text ? " | " + e.text.slice(0, 60) : "");
    }).join("\n"),
  ];

  if (haikuAnalysis) {
    report.push("");
    report.push("## Haiku Analysis");
    report.push("```json");
    report.push(haikuAnalysis);
    report.push("```");
  }

  report = report.join("\n");
  fs.writeFileSync(reportName, report);
  console.log("\nReport: " + reportName);

  // Also write to known location for context-reset pickup
  var latestPath = path.join(HOME, ".claude", "hooks", "session-trace-latest.md");
  try { fs.writeFileSync(latestPath, report); } catch (e) {}
}
