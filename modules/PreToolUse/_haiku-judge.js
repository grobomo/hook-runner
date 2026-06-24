// Shared helper: Haiku judge — gates call this for semantic decisions at ambiguous points.
// Routes through llm-token-proxy POST /judge endpoint (logs to judge_log, visible on dashboard).
// Gracefully falls back when proxy is unavailable — never blocks the gate pipeline.
// Auth: reads ANTHROPIC_AUTH_TOKEN from env (set in settings.json).
"use strict";
var http = require("http");
var path = require("path");
var fs = require("fs");

// Read central config — single source of truth for all haiku gates
var HOME = process.env.HOME || process.env.USERPROFILE || "";
// T806: config moved from proxy/ to hooks/ — fallback to old path
var CONFIG_PATH = path.join(HOME, ".claude", "hooks", "haiku-config.json");
if (!fs.existsSync(CONFIG_PATH)) CONFIG_PATH = path.join(HOME, ".claude", "proxy", "haiku-config.json");
var _cfg = null;
try { _cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch (e) { _cfg = {}; }
var _proxy = _cfg.proxy || {};
var _timeouts = _cfg.timeouts || {};

var _host = _proxy.host || "127.0.0.1";
var _port = _proxy.port || 4100;

// Auth token — read from env first, fall back to settings.json
var _authToken = null;
function getAuthToken() {
  if (_authToken) return _authToken;
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    _authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    return _authToken;
  }
  try {
    var settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "settings.json");
    var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (settings.env && settings.env.ANTHROPIC_AUTH_TOKEN) {
      _authToken = settings.env.ANTHROPIC_AUTH_TOKEN;
      return _authToken;
    }
  } catch (e) {}
  return "";
}

var _available = null;
var _lastCheck = 0;
var HEALTH_TTL_MS = _timeouts.healthCacheTTL || 60000;

function checkHealth() {
  var now = Date.now();
  if (_available !== null && (now - _lastCheck) < HEALTH_TTL_MS) {
    return Promise.resolve(_available);
  }
  return new Promise(function(resolve) {
    var healthHeaders = {};
    var token = getAuthToken();
    if (token) healthHeaders["Authorization"] = "Bearer " + token;
    var req = http.get({
      hostname: _host,
      port: _port,
      path: _proxy.healthPath || "/health",
      headers: healthHeaders,
      timeout: _timeouts.healthCheck || 2000
    }, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        _available = res.statusCode === 200;
        _lastCheck = Date.now();
        resolve(_available);
      });
    });
    req.on("error", function() { _available = false; _lastCheck = Date.now(); resolve(false); });
    req.on("timeout", function() { req.destroy(); _available = false; _lastCheck = Date.now(); resolve(false); });
  });
}

function judge(opts) {
  var fallbackAllow = opts.fallback !== "block";
  var fallbackResult = { allow: fallbackAllow, reason: "judge_unavailable", confidence: 0, latency_ms: 0, fallback_used: true };

  return checkHealth().then(function(up) {
    if (!up) return fallbackResult;

    return new Promise(function(resolve) {
      var startMs = Date.now();
      var payload = JSON.stringify({
        question: opts.question || "",
        context: opts.context || "",
        gate: opts.gate || "unknown",
        project: opts.project || path.basename(process.env.CLAUDE_PROJECT_DIR || "unknown"),
        session_id: process.env.CLAUDE_SESSION_ID || "",
        fallback: opts.fallback || "allow"
      });

      var judgeHeaders = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) };
      var authToken = getAuthToken();
      if (authToken) judgeHeaders["Authorization"] = "Bearer " + authToken;
      var req = http.request({
        hostname: _host,
        port: _port,
        path: _proxy.judgePath || "/judge",
        method: "POST",
        headers: judgeHeaders,
        timeout: _timeouts.judgeCall || 5000
      }, function(res) {
        var data = "";
        res.on("data", function(chunk) { data += chunk; });
        res.on("end", function() {
          var latency = Date.now() - startMs;
          if (res.statusCode === 404) {
            resolve(fallbackResult);
            return;
          }
          try {
            var result = JSON.parse(data);
            result.latency_ms = latency;
            result.fallback_used = false;
            resolve(result);
          } catch (e) {
            resolve({ allow: fallbackAllow, reason: "parse_error", confidence: 0, latency_ms: latency, fallback_used: true });
          }
        });
      });
      req.on("error", function() { resolve(fallbackResult); });
      req.on("timeout", function() {
        req.destroy();
        resolve({ allow: fallbackAllow, reason: "timeout", confidence: 0, latency_ms: Date.now() - startMs, fallback_used: true });
      });
      req.write(payload);
      req.end();
    });
  });
}

judge._resetCache = function() { _available = null; _lastCheck = 0; };

module.exports = judge;
