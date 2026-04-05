// WORKFLOW: shtd
// WHY: A background process silently overwrote live hook modules, stripping WORKFLOW
// tags from 37 modules. Nobody noticed until the test suite caught it by chance.
// Live hooks are shared infrastructure — repo must be the source of truth.
"use strict";
// SessionStart: verify live hooks match repo catalog, auto-repair drift,
// enforce globally enabled workflows in current project, log all activity.
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

function md5(filePath) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
  } catch (e) { return null; }
}

function getHookLog(hooksDir) {
  try { return require(path.join(hooksDir, "hook-log.js")); } catch (e) { return null; }
}

function getWorkflow(hooksDir) {
  try { return require(path.join(hooksDir, "workflow.js")); } catch (e) { return null; }
}

module.exports = function(input) {
  var home = process.env.HOME || process.env.USERPROFILE;
  var hooksDir = path.join(home, ".claude", "hooks");
  var liveModDir = path.join(hooksDir, "run-modules");
  var markerPath = path.join(hooksDir, ".hook-runner-repo");
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var hookLog = getHookLog(hooksDir);
  var messages = [];

  // === Part 1: File Integrity ===
  var repoDir = null;
  if (fs.existsSync(markerPath)) {
    try { repoDir = fs.readFileSync(markerPath, "utf-8").trim(); } catch (e) {}
  }

  var drifted = [];
  var repaired = [];
  var orphans = [];
  var integritySkipped = false;
  var totalChecked = 0;

  if (!repoDir || !fs.existsSync(path.join(repoDir, "modules"))) {
    integritySkipped = true;
    messages.push("Hook integrity: skipped (no .hook-runner-repo marker)");
  } else {
    var repoModDir = path.join(repoDir, "modules");
    var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];

    for (var ei = 0; ei < events.length; ei++) {
      var repoEventDir = path.join(repoModDir, events[ei]);
      var liveEventDir = path.join(liveModDir, events[ei]);
      if (!fs.existsSync(repoEventDir)) continue;

      var repoEntries;
      try { repoEntries = fs.readdirSync(repoEventDir, { withFileTypes: true }); } catch (e) { continue; }

      for (var fi = 0; fi < repoEntries.length; fi++) {
        var ent = repoEntries[fi];
        if (ent.isFile() && ent.name.indexOf(".js") === ent.name.length - 3) {
          totalChecked++;
          var repoFile = path.join(repoEventDir, ent.name);
          var liveFile = path.join(liveEventDir, ent.name);
          var rh = md5(repoFile);
          var lh = md5(liveFile);

          if (rh && !lh) {
            try {
              if (!fs.existsSync(liveEventDir)) fs.mkdirSync(liveEventDir, { recursive: true });
              fs.copyFileSync(repoFile, liveFile);
              drifted.push(events[ei] + "/" + ent.name + " (missing->copied)");
              repaired.push(events[ei] + "/" + ent.name);
            } catch (e) {
              drifted.push(events[ei] + "/" + ent.name + " (missing, REPAIR FAILED)");
            }
          } else if (rh && lh && rh !== lh) {
            try {
              fs.copyFileSync(repoFile, liveFile);
              drifted.push(events[ei] + "/" + ent.name + " (drift->repaired)");
              repaired.push(events[ei] + "/" + ent.name);
            } catch (e) {
              drifted.push(events[ei] + "/" + ent.name + " (drift, REPAIR FAILED)");
            }
          }
        } else if (ent.isDirectory() && ent.name !== "archive" && ent.name.charAt(0) !== "_") {
          // Project-scoped subdir
          var subRepoDir = path.join(repoEventDir, ent.name);
          var subLiveDir = path.join(liveEventDir, ent.name);
          var subFiles;
          try { subFiles = fs.readdirSync(subRepoDir); } catch (e) { continue; }
          for (var sfi = 0; sfi < subFiles.length; sfi++) {
            if (subFiles[sfi].indexOf(".js") !== subFiles[sfi].length - 3) continue;
            totalChecked++;
            var srh = md5(path.join(subRepoDir, subFiles[sfi]));
            var slh = md5(path.join(subLiveDir, subFiles[sfi]));
            if (srh && !slh) {
              try {
                if (!fs.existsSync(subLiveDir)) fs.mkdirSync(subLiveDir, { recursive: true });
                fs.copyFileSync(path.join(subRepoDir, subFiles[sfi]), path.join(subLiveDir, subFiles[sfi]));
                drifted.push(events[ei] + "/" + ent.name + "/" + subFiles[sfi] + " (missing->copied)");
                repaired.push(events[ei] + "/" + ent.name + "/" + subFiles[sfi]);
              } catch (e) {}
            } else if (srh && slh && srh !== slh) {
              try {
                fs.copyFileSync(path.join(subRepoDir, subFiles[sfi]), path.join(subLiveDir, subFiles[sfi]));
                drifted.push(events[ei] + "/" + ent.name + "/" + subFiles[sfi] + " (drift->repaired)");
                repaired.push(events[ei] + "/" + ent.name + "/" + subFiles[sfi]);
              } catch (e) {}
            }
          }
        }
      }

      // Detect orphans in live
      if (fs.existsSync(liveEventDir)) {
        var liveFiles;
        try { liveFiles = fs.readdirSync(liveEventDir); } catch (e) { liveFiles = []; }
        for (var li = 0; li < liveFiles.length; li++) {
          if (liveFiles[li].indexOf(".js") !== liveFiles[li].length - 3) continue;
          try { if (fs.statSync(path.join(liveEventDir, liveFiles[li])).isDirectory()) continue; } catch (e) { continue; }
          if (!fs.existsSync(path.join(repoEventDir, liveFiles[li]))) {
            orphans.push(events[ei] + "/" + liveFiles[li]);
          }
        }
      }
    }

    // Check runner files
    var RUNNER_FILES;
    try { RUNNER_FILES = require(path.join(repoDir, "constants.js")).RUNNER_FILES; } catch (e) { RUNNER_FILES = []; }
    for (var ri = 0; ri < RUNNER_FILES.length; ri++) {
      totalChecked++;
      var rrh = md5(path.join(repoDir, RUNNER_FILES[ri]));
      var rlh = md5(path.join(hooksDir, RUNNER_FILES[ri]));
      if (rrh && rlh && rrh !== rlh) {
        try {
          fs.copyFileSync(path.join(repoDir, RUNNER_FILES[ri]), path.join(hooksDir, RUNNER_FILES[ri]));
          drifted.push("runner:" + RUNNER_FILES[ri] + " (drift->repaired)");
          repaired.push("runner:" + RUNNER_FILES[ri]);
        } catch (e) {
          drifted.push("runner:" + RUNNER_FILES[ri] + " (REPAIR FAILED)");
        }
      }
    }

    if (drifted.length > 0) {
      messages.push("Hook integrity: " + repaired.length + "/" + drifted.length + " drifted files repaired (" + totalChecked + " checked)");
      for (var di = 0; di < drifted.length; di++) {
        messages.push("  - " + drifted[di]);
      }
    } else {
      messages.push("Hook integrity: " + totalChecked + " files verified, all match repo");
    }
    if (orphans.length > 0) {
      messages.push("Hook integrity: " + orphans.length + " orphan(s) in live: " + orphans.join(", "));
    }
  }

  // === Part 2: Workflow Compliance ===
  // Check that no project-level config disables a globally enforced workflow.
  // Does NOT touch .workflow-state.json (single-workflow, would overwrite).
  // Enforcement is via workflow-config.json controlling which modules load.
  var wf = getWorkflow(hooksDir);
  var violations = [];

  if (wf && projectDir) {
    var globalConfig = wf.readConfig(hooksDir);
    var enforced = Object.keys(globalConfig).filter(function(k) { return globalConfig[k] === true; });
    var projectConfigPath = path.join(projectDir, "workflow-config.json");
    var projectConfig = {};
    if (fs.existsSync(projectConfigPath)) {
      try { projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8")); } catch (e) {}
    }

    for (var wi = 0; wi < enforced.length; wi++) {
      if (projectConfig[enforced[wi]] === false) {
        violations.push(enforced[wi]);
      }
    }

    if (violations.length > 0) {
      messages.push("Workflow compliance: VIOLATION — " + violations.join(", ") + " disabled at project level (globally enforced)");
    } else if (enforced.length > 0) {
      messages.push("Workflow compliance: " + enforced.length + " enforced workflow(s) OK");
    }
  }

  // === Log everything ===
  if (hookLog) {
    hookLog.logHook("SessionStart", "hook-integrity-check", "integrity", {
      project: projectDir,
      fileIntegrity: {
        skipped: integritySkipped,
        totalChecked: totalChecked,
        driftedCount: drifted.length,
        repairedCount: repaired.length,
        orphanCount: orphans.length,
        drifted: drifted,
        orphans: orphans,
        repoDir: repoDir || "unknown"
      },
      workflowCompliance: {
        violations: violations
      }
    });
  }

  if (messages.length === 0) return null;
  return { text: messages.join("\n") };
};
