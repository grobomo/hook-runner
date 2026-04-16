// WORKFLOW: starter
// WHY: Hook system broke silently after modules drifted from known-good state.
//   Periodic drift detection catches changes before they cause session failures.
// SessionStart: compare live files against last snapshot (daily).
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var hooksDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude", "hooks");
  var snapshotsDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude", "snapshots");
  var markerPath = path.join(hooksDir, ".drift-last-check");

  // Only check once per day
  if (fs.existsSync(markerPath)) {
    try {
      var lastCheck = parseInt(fs.readFileSync(markerPath, "utf-8").trim(), 10);
      if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) return null;
    } catch (e) {}
  }

  // Update marker
  try { fs.writeFileSync(markerPath, "" + Date.now()); } catch (e) {}

  // Check for snapshot
  var latestPath = path.join(snapshotsDir, "latest.json");
  if (!fs.existsSync(latestPath)) {
    return { text: "DRIFT-CHECK: No snapshot exists. Run `node snapshot.js create` from hook-runner to baseline your setup." };
  }

  var snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(latestPath, "utf-8")); } catch (e) { return null; }

  // Quick check: snapshot age
  var ageHours = (Date.now() - new Date(snapshot.timestamp).getTime()) / (1000 * 60 * 60);
  if (ageHours > 168) { // 7 days
    return { text: "DRIFT-CHECK: Snapshot is " + Math.round(ageHours / 24) + " days old. Consider running `node snapshot.js create` to update it." };
  }

  // Fast drift check — only check runners, config, and workflow files (not all modules)
  var crypto = require("crypto");
  function sha256(filePath) {
    try { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
    catch (e) { return null; }
  }

  var drifted = [];
  var labels = Object.keys(snapshot.files);
  for (var i = 0; i < labels.length; i++) {
    var entry = snapshot.files[labels[i]];
    // Only check critical categories in the fast check
    if (entry.category !== "runner" && entry.category !== "config" && entry.category !== "workflow" && entry.category !== "state") continue;
    var absPath = (entry.absPath || "").replace(/\//g, path.sep);
    var hash = sha256(absPath);
    if (!hash) {
      drifted.push(labels[i] + " (missing)");
    } else if (hash !== entry.sha256) {
      drifted.push(labels[i] + " (modified)");
    }
  }

  if (drifted.length === 0) return null;

  return {
    text: "DRIFT-CHECK: " + drifted.length + " critical file(s) changed since snapshot:\n" +
      drifted.map(function(d) { return "  - " + d; }).join("\n") +
      "\nRun `node snapshot.js drift` for full report, or `node snapshot.js create` to accept current state."
  };
};
