// TOOLS: Edit, Write, Bash
// WORKFLOW: shtd, gsd
// WHY: Inter-project TODO items (XREF tags) represent live bugs from real-world
// usage in other projects. Without enforcement, Claude works on normal backlog
// while critical feedback sits unresolved. This gate blocks non-XREF work when
// XREF items are pending — forces P0 items to be addressed first.
// T486: Inter-project TODO priority system.
"use strict";
var fs = require("fs");
var path = require("path");

var XREF_PATTERN = /<!--\s*XREF:([^:]+):(\S+)\s+(\S+)\s*-->/;

// Cache: avoid re-scanning TODO.md on every tool call
var _cache = { path: "", mtime: 0, xrefItems: [] };

function getXrefItems(projectDir) {
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var stat = fs.statSync(todoPath);
    if (_cache.path === todoPath && _cache.mtime === stat.mtimeMs) return _cache.xrefItems;
    var content = fs.readFileSync(todoPath, "utf-8");
    var items = [];
    var lines = content.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (!/^- \[ \] /.test(lines[i])) continue;
      var m = lines[i].match(XREF_PATTERN);
      if (m) items.push({ source: m[1], taskId: m[2], date: m[3] });
    }
    // Also check dedicated section
    var sectionStart = content.indexOf("## Inbound Requests");
    if (sectionStart === -1) sectionStart = content.indexOf("## Inter-Project Requests");
    if (sectionStart !== -1) {
      var sectionLines = content.slice(sectionStart).split("\n");
      for (var si = 1; si < sectionLines.length; si++) {
        if (/^## /.test(sectionLines[si]) && si > 0) break;
        if (!/^- \[ \] /.test(sectionLines[si])) continue;
        if (!XREF_PATTERN.test(sectionLines[si])) {
          items.push({ source: "section", taskId: "", date: "" });
        }
      }
    }
    _cache = { path: todoPath, mtime: stat.mtimeMs, xrefItems: items };
    return items;
  } catch(e) { return []; }
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write" && tool !== "Bash") return null;

  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (!projectDir) return null;

  var xrefItems = getXrefItems(projectDir);
  if (xrefItems.length === 0) return null;

  // Allow edits TO TODO.md itself (marking items complete, adding context)
  if (tool === "Edit" || tool === "Write") {
    var toolInput;
    try {
      toolInput = typeof input.tool_input === "string"
        ? JSON.parse(input.tool_input) : input.tool_input || {};
    } catch(e) { toolInput = input.tool_input || {}; }
    var filePath = (toolInput.file_path || "").replace(/\\/g, "/");
    var basename = path.basename(filePath);
    // Allow: TODO.md, SESSION_STATE.md, CHANGELOG.md, specs/, .planning/, .claude/, test files
    if (basename === "TODO.md" || basename === "SESSION_STATE.md" || basename === "CHANGELOG.md") return null;
    if (/[\/\\]specs[\/\\]/.test(filePath)) return null;
    if (/[\/\\]\.planning[\/\\]/.test(filePath)) return null;
    if (/[\/\\]\.claude[\/\\]/.test(filePath)) return null;
    if (/[\/\\]tests?[\/\\]|scripts\/test\/|\.test\.[jt]s$|\.spec\.[jt]s$/.test(filePath)) return null;
  }

  // Allow Bash commands that are read-only or test-related
  if (tool === "Bash") {
    var cmd = "";
    try {
      var bi = typeof input.tool_input === "string"
        ? JSON.parse(input.tool_input) : input.tool_input || {};
      cmd = (bi.command || "").trim();
    } catch(e) {}
    var realCmd = cmd.replace(/^(\s*cd\s+[^;&|]+\s*&&\s*)+/, "").trim();
    realCmd = realCmd.replace(/^(\s*\w+=(?:\$\([^)]*\)|"[^"]*"|'[^']*'|\S)*\s+)+/, "").trim();
    var firstCmd = realCmd.split("|")[0].trim();
    // Allow read-only, git, test, and setup commands
    if (/^\s*(git|gh|gh_auto|ls|cat|head|tail|grep|rg|find|wc|diff|echo|pwd|env|which|type|node\s+setup\.js|node\s+scripts\/test|bash\s+scripts\/test)\b/.test(firstCmd)) return null;
  }

  // Check if the current branch references an XREF task ID
  var branch = (input._git && input._git.branch) || "";
  for (var xi = 0; xi < xrefItems.length; xi++) {
    if (xrefItems[xi].taskId && branch.indexOf(xrefItems[xi].taskId) !== -1) {
      // Working on the XREF item — allow
      return null;
    }
  }

  // Block — XREF items are pending but Claude is doing something else
  var itemList = xrefItems.map(function(x) {
    return "  - " + (x.taskId || "unnamed") + " from " + x.source + (x.date ? " (" + x.date + ")" : "");
  }).join("\n");

  return {
    decision: "block",
    reason: "INTER-PROJECT PRIORITY GATE: " + xrefItems.length + " P0 item(s) pending.\n" +
      "These are from other projects and represent live bugs or critical feedback:\n" +
      itemList + "\n\n" +
      "Address these FIRST before working on normal backlog.\n" +
      "Create a branch referencing the XREF task ID, fix it, mark it complete in TODO.md.\n" +
      "This gate will unblock once all XREF items in TODO.md are checked off."
  };
};
