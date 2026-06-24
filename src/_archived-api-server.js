#!/usr/bin/env node
"use strict";
// T774: Hook-runner API server
// Exposes hook-runner capabilities as REST endpoints.
// Default port: 4102 (env HOOK_RUNNER_PORT to override)
//
// Endpoints:
//   GET  /api/status     — stop-hook-verify summary
//   GET  /api/health     — full verification detail
//   GET  /api/lessons    — self-healing lesson recall (?category=X&limit=N)
//   GET  /api/modules    — installed modules by event
//   GET  /api/log        — recent hook log (?last=N&event=X&module=X)
//   GET  /api/rules      — stop-haiku-rules list
//   POST /api/verify     — trigger verification + auto-fix
//   GET  /ping           — liveness check

var http = require("http");
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var url = require("url");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var PORT = parseInt(process.env.HOOK_RUNNER_PORT || "4102", 10);
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var REPO_DIR = path.resolve(__dirname, "..");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");
var HEALING_DIR = path.join(HOOKS_DIR, "self-healing");
var RULES_PATH = path.join(HOME, ".claude", "proxy", "stop-haiku-rules.yaml");

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data, null, 2) + "\n");
}

// --- /api/status ---
function handleStatus(req, res) {
  var verifyScript = path.join(REPO_DIR, "scripts", "stop-hook-verify.js");
  try {
    var output = cp.execSync("node " + JSON.stringify(verifyScript) + " --json", {
      encoding: "utf-8", timeout: 15000, windowsHide: true
    });
    json(res, 200, JSON.parse(output));
  } catch (e) {
    try { json(res, 200, JSON.parse(e.stdout || "{}")); } catch (e2) {
      json(res, 500, { error: "verify failed", detail: (e.message || "").slice(0, 200) });
    }
  }
}

// --- /api/health ---
function handleHealth(req, res) {
  var healthLog = path.join(HOOKS_DIR, "hook-health.jsonl");
  var entries = [];
  try {
    var lines = fs.readFileSync(healthLog, "utf-8").trim().split("\n").slice(-20);
    entries = lines.map(function(l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) {}
  json(res, 200, {
    ts: new Date().toISOString(),
    recent_hooks: entries.length,
    entries: entries
  });
}

// --- /api/lessons ---
function handleLessons(req, res) {
  var parsed = url.parse(req.url, true);
  var category = parsed.query.category || "*";
  var limit = parseInt(parsed.query.limit || "20", 10);
  var indexPath = path.join(HEALING_DIR, "index.json");

  var index = {};
  try { index = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch (e) {}

  var results = [];
  var keys = Object.keys(index);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf("_stats") !== -1) continue;
    if (category === "*" || keys[i] === category || keys[i].indexOf(category + "/") === 0) {
      results.push({ path: keys[i], data: index[keys[i]] });
    }
  }
  results.sort(function(a, b) { return b.data.count - a.data.count; });

  json(res, 200, {
    query: category,
    total: results.length,
    results: results.slice(0, limit)
  });
}

// --- /api/modules ---
function handleModules(req, res) {
  var modulesDir = path.join(HOOKS_DIR, "run-modules");
  var result = {};
  try {
    var events = fs.readdirSync(modulesDir);
    for (var i = 0; i < events.length; i++) {
      var eventDir = path.join(modulesDir, events[i]);
      if (!fs.statSync(eventDir).isDirectory()) continue;
      result[events[i]] = [];
      var walk = function(dir, prefix) {
        var items = fs.readdirSync(dir);
        for (var j = 0; j < items.length; j++) {
          var fp = path.join(dir, items[j]);
          if (fs.statSync(fp).isDirectory()) {
            walk(fp, (prefix ? prefix + "/" : "") + items[j]);
          } else if (items[j].endsWith(".js") && !items[j].startsWith("_")) {
            result[events[i]].push((prefix ? prefix + "/" : "") + items[j]);
          }
        }
      };
      walk(eventDir, "");
    }
  } catch (e) {}

  var total = 0;
  Object.keys(result).forEach(function(k) { total += result[k].length; });
  json(res, 200, { total: total, events: result });
}

// --- /api/log ---
function handleLog(req, res) {
  var parsed = url.parse(req.url, true);
  var last = parseInt(parsed.query.last || "20", 10);
  var filterEvent = parsed.query.event || null;
  var filterModule = parsed.query.module || null;

  var entries = [];
  try {
    var lines = fs.readFileSync(HOOK_LOG, "utf-8").trim().split("\n").slice(-200);
    for (var i = lines.length - 1; i >= 0 && entries.length < last; i--) {
      try {
        var e = JSON.parse(lines[i]);
        if (filterEvent && e.event !== filterEvent) continue;
        if (filterModule && e.module && e.module.indexOf(filterModule) === -1) continue;
        entries.push(e);
      } catch (ex) {}
    }
  } catch (e) {}

  json(res, 200, { count: entries.length, entries: entries });
}

// --- /api/rules ---
function handleRules(req, res) {
  try {
    var content = fs.readFileSync(RULES_PATH, "utf-8");
    // Simple YAML rule extraction
    var rules = [];
    var current = null;
    var lines = content.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var nameMatch = lines[i].match(/^\s+-\s+name:\s*(.+)/);
      if (nameMatch) {
        if (current) rules.push(current);
        current = { name: nameMatch[1].trim(), check: "", action: "" };
      }
      if (current) {
        var checkMatch = lines[i].match(/^\s+check:\s*"(.+)"/);
        if (checkMatch) current.check = checkMatch[1];
        var actionMatch = lines[i].match(/^\s+action:\s*"(.+)"/);
        if (actionMatch) current.action = actionMatch[1];
      }
    }
    if (current) rules.push(current);
    json(res, 200, { count: rules.length, file: RULES_PATH, rules: rules });
  } catch (e) {
    json(res, 500, { error: "Can't read rules: " + e.message });
  }
}

// --- POST /api/verify ---
function handleVerify(req, res) {
  var verifyScript = path.join(REPO_DIR, "scripts", "stop-hook-verify.js");
  try {
    var output = cp.execSync("node " + JSON.stringify(verifyScript) + " --fix --json", {
      encoding: "utf-8", timeout: 15000, windowsHide: true
    });
    json(res, 200, JSON.parse(output));
  } catch (e) {
    try { json(res, 200, JSON.parse(e.stdout || "{}")); } catch (e2) {
      json(res, 500, { error: "verify failed", detail: (e.message || "").slice(0, 200) });
    }
  }
}

// --- Router ---
var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var p = parsed.pathname;

  if (p === "/ping") return json(res, 200, { ok: true, ts: new Date().toISOString() });
  if (p === "/api/status") return handleStatus(req, res);
  if (p === "/api/health") return handleHealth(req, res);
  if (p === "/api/lessons") return handleLessons(req, res);
  if (p === "/api/modules") return handleModules(req, res);
  if (p === "/api/log") return handleLog(req, res);
  if (p === "/api/rules") return handleRules(req, res);
  if (p === "/api/verify" && req.method === "POST") return handleVerify(req, res);

  json(res, 404, {
    error: "not found",
    endpoints: ["/ping", "/api/status", "/api/health", "/api/lessons", "/api/modules", "/api/log", "/api/rules", "POST /api/verify"]
  });
});

server.listen(PORT, "127.0.0.1", function() {
  console.log("hook-runner API server on http://127.0.0.1:" + PORT);
  console.log("Endpoints: /ping /api/status /api/health /api/lessons /api/modules /api/log /api/rules");
});
