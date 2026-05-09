// Shared helper: Haiku judge — gates call this for semantic decisions at ambiguous points.
// Routes through llm-token-proxy POST /judge endpoint (logs to judge_log, visible on dashboard).
// Gracefully falls back when proxy is unavailable — never blocks the gate pipeline.
"use strict";
var http = require("http");
var path = require("path");

var JUDGE_URL = process.env.JUDGE_URL || "http://127.0.0.1:4100";
var _parsed;
try { _parsed = new URL(JUDGE_URL); } catch (e) { _parsed = { hostname: "127.0.0.1", port: "4100" }; }
var _host = _parsed.hostname || "127.0.0.1";
var _port = parseInt(_parsed.port, 10) || 4100;

var _available = null;
var _lastCheck = 0;
var HEALTH_TTL_MS = 60000;

function checkHealth() {
  var now = Date.now();
  if (_available !== null && (now - _lastCheck) < HEALTH_TTL_MS) {
    return Promise.resolve(_available);
  }
  return new Promise(function(resolve) {
    var req = http.get({
      hostname: _host,
      port: _port,
      path: "/health",
      timeout: 2000
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

      var req = http.request({
        hostname: _host,
        port: _port,
        path: "/judge",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 5000
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
