// Shared helpers for GSD gate modules.
// Prefixed with _ so load-modules.js skips it (not a standalone module).
"use strict";
var fs = require("fs");
var path = require("path");

/**
 * Parse active phase numbers from .planning/ROADMAP.md
 * Returns array of phase number strings under "Active Milestone"
 * @param {string} projectDir
 * @returns {string[]}
 */
function getActivePhases(projectDir) {
  var roadmap = path.join(projectDir, ".planning", "ROADMAP.md");
  if (!fs.existsSync(roadmap)) return [];

  try {
    var content = fs.readFileSync(roadmap, "utf-8");
    var phases = [];
    var inActive = false;
    var lines = content.split("\n");

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^##\s+Active Milestone/i.test(line)) {
        inActive = true;
        continue;
      }
      if (inActive && /^##\s/.test(line) && !/^###/.test(line)) break;
      if (inActive) {
        var phaseMatch = line.match(/^###\s+Phase\s+(\d+)/i);
        if (phaseMatch) phases.push(phaseMatch[1]);
      }
    }
    return phases;
  } catch (e) {
    return [];
  }
}

module.exports = { getActivePhases: getActivePhases };
