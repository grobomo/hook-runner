// WORKFLOW: shtd
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

  // 1. Check core runners exist
  var runners = ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "run-userpromptsubmit.js", "load-modules.js", "hook-log.js"];
  var missingRunners = [];
  for (var i = 0; i < runners.length; i++) {
    if (!fs.existsSync(path.join(hooksDir, runners[i]))) {
      missingRunners.push(runners[i]);
    }
  }
  if (missingRunners.length > 0) {
    warnings.push("Missing runners: " + missingRunners.join(", ") + ". Run `node setup.js` to reinstall.");
  }

  // 2. Check module directories exist and modules load
  var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
  var loadErrors = [];
  for (var ei = 0; ei < events.length; ei++) {
    var modDir = path.join(hooksDir, "run-modules", events[ei]);
    if (!fs.existsSync(modDir)) continue;
    var files;
    try { files = fs.readdirSync(modDir); } catch(e) { continue; }
    for (var fi = 0; fi < files.length; fi++) {
      var fPath = path.join(modDir, files[fi]);
      var stat;
      try { stat = fs.statSync(fPath); } catch(e) { continue; }
      if (stat.isDirectory()) {
        // skip archive directories — contain superseded modules with stale deps
        if (files[fi] === "archive") continue;
        // project-scoped modules
        var subFiles;
        try { subFiles = fs.readdirSync(fPath); } catch(e) { continue; }
        for (var si = 0; si < subFiles.length; si++) {
          if (!subFiles[si].endsWith(".js")) continue;
          try {
            require(path.join(fPath, subFiles[si]));
          } catch(e) {
            loadErrors.push(events[ei] + "/" + files[fi] + "/" + subFiles[si] + ": " + e.message);
          }
        }
      } else if (files[fi].endsWith(".js")) {
        try {
          require(fPath);
        } catch(e) {
          loadErrors.push(events[ei] + "/" + files[fi] + ": " + e.message);
        }
      }
    }
  }
  if (loadErrors.length > 0) {
    warnings.push("Module load errors:\n  " + loadErrors.join("\n  "));
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

  if (warnings.length === 0) return null;

  return { text: "hook-runner health: " + warnings.length + " issue(s) found:\n" + warnings.map(function(w) { return "  - " + w; }).join("\n") };
};
