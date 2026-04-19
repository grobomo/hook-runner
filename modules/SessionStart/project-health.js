// WORKFLOW: shtd, starter
// WHY: Broken hook runners silently failed, leaving gates unenforced.
// SessionStart: run hook-runner health check on session start
// Warns if any runners are missing, modules fail to load, or settings are misconfigured.
// Runs the same checks as `node setup.js --health` but outputs warnings as session text.
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var home = process.env.HOME || process.env.USERPROFILE;
  var hooksDir = path.join(home, ".claude", "hooks");
  var settingsPath = path.join(home, ".claude", "settings.json");
  var warnings = [];

  // 1. Check core runners exist (shared constant)
  var constantsPath = path.join(hooksDir, "constants.js");
  var runners;
  try { runners = require(constantsPath).RUNNER_FILES; } catch(e) {
    runners = ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "run-userpromptsubmit.js", "load-modules.js", "hook-log.js", "run-async.js", "workflow.js", "workflow-cli.js", "constants.js"];
  }
  var missingRunners = [];
  for (var i = 0; i < runners.length; i++) {
    if (!fs.existsSync(path.join(hooksDir, runners[i]))) {
      missingRunners.push(runners[i]);
    }
  }
  if (missingRunners.length > 0) {
    warnings.push("Missing runners: " + missingRunners.join(", ") + ". Run `node setup.js` to reinstall.");
  }

  // 2. Check module directories exist and modules are readable
  // T499: replaced require() with fs.accessSync() — loading 60+ modules cost ~350ms.
  // Syntax/dep errors surface when modules actually run and get logged by the runner.
  var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
  var missingDirs = [];
  var unreadable = [];
  for (var ei = 0; ei < events.length; ei++) {
    var modDir = path.join(hooksDir, "run-modules", events[ei]);
    if (!fs.existsSync(modDir)) {
      missingDirs.push(events[ei]);
      continue;
    }
    var files;
    try { files = fs.readdirSync(modDir); } catch(e) { continue; }
    for (var fi = 0; fi < files.length; fi++) {
      var fPath = path.join(modDir, files[fi]);
      var stat;
      try { stat = fs.statSync(fPath); } catch(e) { continue; }
      if (stat.isDirectory()) {
        if (files[fi] === "archive") continue;
        var subFiles;
        try { subFiles = fs.readdirSync(fPath); } catch(e) { continue; }
        for (var si = 0; si < subFiles.length; si++) {
          if (subFiles[si].indexOf(".js", subFiles[si].length - 3) === -1) continue;
          try {
            fs.accessSync(path.join(fPath, subFiles[si]), fs.constants.R_OK);
          } catch(e) {
            unreadable.push(events[ei] + "/" + files[fi] + "/" + subFiles[si]);
          }
        }
      } else if (files[fi].indexOf(".js", files[fi].length - 3) !== -1) {
        try {
          fs.accessSync(fPath, fs.constants.R_OK);
        } catch(e) {
          unreadable.push(events[ei] + "/" + files[fi]);
        }
      }
    }
  }
  if (missingDirs.length > 0) {
    warnings.push("Missing module dirs: " + missingDirs.join(", ") + ". Run `node setup.js --sync`.");
  }
  if (unreadable.length > 0) {
    warnings.push("Unreadable modules:\n  " + unreadable.join("\n  "));
  }

  // 3. Check settings.json has hooks
  if (fs.existsSync(settingsPath)) {
    try {
      var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      var hooks = settings.hooks || {};
      if (Object.keys(hooks).length === 0) {
        warnings.push("settings.json has no hooks configured. Run `node setup.js` to set up.");
      }
    } catch(e) {
      warnings.push("settings.json parse error: " + e.message);
    }
  } else {
    warnings.push("settings.json not found at " + settingsPath);
  }

  // 4. Check hook log writability
  var logPath = path.join(hooksDir, "hook-log.jsonl");
  try {
    fs.accessSync(path.dirname(logPath), fs.constants.W_OK);
  } catch(e) {
    warnings.push("Hook log directory not writable: " + path.dirname(logPath));
  }

  // 5. Check watchdog alert flag (T128)
  var alertPath = path.join(hooksDir, ".watchdog-alert");
  if (fs.existsSync(alertPath)) {
    try {
      var alert = JSON.parse(fs.readFileSync(alertPath, "utf-8"));
      var alertMsg = "WATCHDOG ALERT (" + alert.timestamp + "): " + (alert.failures || []).join(", ");
      if (alert.repairs && alert.repairs.length > 0) {
        alertMsg += " — auto-repaired: " + alert.repairs.join(", ");
      }
      warnings.unshift(alertMsg);
      // Clear the alert after reading it (one-shot notification)
      try { fs.unlinkSync(alertPath); } catch(e) {}
    } catch(e) {
      warnings.unshift("Watchdog alert flag exists but unreadable");
    }
  }

  if (warnings.length === 0) return null;

  return { text: "hook-runner health: " + warnings.length + " issue(s) found:\n" + warnings.map(function(w) { return "  - " + w; }).join("\n") };
};
