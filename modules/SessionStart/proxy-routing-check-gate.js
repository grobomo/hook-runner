// TOOLS: SessionStart
// WORKFLOW: haiku-rules
// WHY: Token tracking depends on ANTHROPIC_BASE_URL routing through the local
//      proxy at :4100. If the proxy is down or URL is wrong, all LLM calls go
//      untracked and haiku gates silently fail.
//
// INCIDENT HISTORY:
//   2026-05-16: Proxy was down, all haiku gates returned null (fail-open),
//   session ran unmonitored for 2 hours without stop enforcement.
"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");
var cp = require("child_process");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "proxy-routing-check-gate";
  obj.event = "SessionStart";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

module.exports = function(input) {
  var baseUrl = process.env.ANTHROPIC_BASE_URL || "";

  if (!baseUrl || baseUrl.indexOf("127.0.0.1:4100") === -1) {
    _log({ result: "warn", reason: "ANTHROPIC_BASE_URL not routed through proxy", url: baseUrl.slice(0, 50) });
    process.stderr.write("[proxy-routing-check] WARNING: ANTHROPIC_BASE_URL does not point to 127.0.0.1:4100. Token tracking disabled.\n");
    return null;
  }

  try {
    var result = cp.execSync("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health", {
      timeout: 3000,
      windowsHide: true
    });
    var code = result.toString().trim().replace(/'/g, "");
    if (code === "200") {
      _log({ result: "pass", reason: "proxy healthy" });
      return null;
    }
    _log({ result: "warn", reason: "proxy unhealthy, status: " + code });
    process.stderr.write("[proxy-routing-check] WARNING: Proxy at :4100 returned status " + code + ". Haiku gates may fail.\n");
  } catch (e) {
    _log({ result: "warn", reason: "proxy unreachable: " + e.message });
    process.stderr.write("[proxy-routing-check] WARNING: Proxy at :4100 unreachable. Attempting start...\n");
    try {
      cp.execSync("systemctl --user start token-proxy.service", { timeout: 5000, windowsHide: true });
      _log({ result: "started", reason: "proxy service started" });
      process.stderr.write("[proxy-routing-check] Proxy service started.\n");
    } catch (startErr) {
      _log({ result: "warn", reason: "could not start proxy: " + startErr.message });
      process.stderr.write("[proxy-routing-check] Could not start proxy. Haiku gates will fail-open.\n");
    }
  }

  return null;
};
