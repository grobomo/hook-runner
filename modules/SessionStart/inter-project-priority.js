// WORKFLOW: shtd, gsd, starter
// WHY: When another project writes a TODO to this project, it means a real-world
// bug was observed in live usage. These items are P0 priority — they come from
// actual feedback, not speculative backlog. Without enforcement, they get buried
// under normal tasks and never get addressed.
// T486: Inter-project TODO priority system.
"use strict";
var fs = require("fs");
var path = require("path");

// XREF tag format: <!-- XREF:source-project:task-id YYYY-MM-DD -->
var XREF_PATTERN = /<!--\s*XREF:([^:]+):(\S+)\s+(\S+)\s*-->/;

module.exports = function(input) {
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (!projectDir) return null;

  var todoPath = path.join(projectDir, "TODO.md");
  var content;
  try { content = fs.readFileSync(todoPath, "utf-8"); } catch(e) { return null; }

  // Find unchecked items with XREF tags
  var xrefItems = [];
  var lines = content.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!/^- \[ \] /.test(line)) continue;
    var m = line.match(XREF_PATTERN);
    if (m) {
      xrefItems.push({
        line: line.replace(XREF_PATTERN, "").replace(/\s+$/, ""),
        source: m[1],
        taskId: m[2],
        date: m[3],
        lineNum: i + 1
      });
    }
  }

  // Also check the dedicated section header
  var sectionStart = content.indexOf("## Inbound Requests");
  if (sectionStart === -1) sectionStart = content.indexOf("## Inter-Project Requests");
  if (sectionStart !== -1) {
    // Scan lines after the section header for unchecked items without XREF tags
    var sectionLines = content.slice(sectionStart).split("\n");
    for (var si = 1; si < sectionLines.length; si++) {
      var sline = sectionLines[si];
      if (/^## /.test(sline) && si > 0) break; // next section
      if (!/^- \[ \] /.test(sline)) continue;
      // Skip if already captured by XREF scan
      var alreadyFound = false;
      for (var xi = 0; xi < xrefItems.length; xi++) {
        if (sline.indexOf(xrefItems[xi].taskId) !== -1) { alreadyFound = true; break; }
      }
      if (!alreadyFound) {
        xrefItems.push({
          line: sline,
          source: "unknown",
          taskId: "",
          date: "",
          lineNum: -1
        });
      }
    }
  }

  if (xrefItems.length === 0) return null;

  // Build the priority injection
  var msg = "INTER-PROJECT P0 ITEMS (" + xrefItems.length + " pending):\n";
  msg += "These items were filed by OTHER projects from real-world usage.\n";
  msg += "They represent live bugs or critical feedback — address BEFORE normal backlog.\n\n";
  for (var j = 0; j < xrefItems.length; j++) {
    var item = xrefItems[j];
    msg += "  P0: " + item.line.replace(/^- \[ \] /, "");
    if (item.source !== "unknown") msg += " (from: " + item.source + ")";
    if (item.date) msg += " [" + item.date + "]";
    msg += "\n";
  }
  msg += "\nDo these FIRST. They are higher priority than any other TODO item.";

  return { text: msg };
};
