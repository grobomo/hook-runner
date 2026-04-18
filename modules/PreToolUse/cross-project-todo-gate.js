"use strict";
// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Prevents cross-project TODO items from being written into the current
// project's TODO.md. These items belong in the referenced project's TODO.md
// where they'll actually get picked up and executed. The cwd-drift-detector
// already allows writing TODO.md to other projects — this gate ensures Claude
// uses that path instead of dumping everything locally.
var fs = require("fs");
var path = require("path");
var os = require("os");

var PROJECTS_ROOT = (process.env.CLAUDE_PROJECTS_ROOT ||
  (process.env.CLAUDE_PROJECT_DIR ? path.dirname(process.env.CLAUDE_PROJECT_DIR) : "") ||
  "").replace(/\\/g, "/").toLowerCase();

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var toolInput;
  try {
    toolInput = typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input)
      : input.tool_input || {};
  } catch(e) {
    toolInput = input.tool_input || {};
  }

  var filePath = (toolInput.file_path || "").replace(/\\/g, "/");
  if (!filePath) return null;

  // Only check TODO.md in the current project
  if (path.basename(filePath) !== "TODO.md") return null;

  var currentProject = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (!currentProject) return null;

  // Make sure this is the current project's TODO.md (not writing to another project)
  var normalizedFile = filePath.toLowerCase();
  var normalizedProject = currentProject.toLowerCase().replace(/\\/g, "/");
  if (normalizedFile.indexOf(normalizedProject.toLowerCase()) < 0) return null;

  // Get the content being written
  var content = toolInput.new_string || toolInput.content || "";
  if (!content) return null;

  // Only check unchecked TODO lines (- [ ] ...) and their indented sub-items.
  // Completed items ([x], [MOVED]), summaries, and prose are fine.
  var lines = content.split("\n");
  var todoLines = [];
  var inUncheckedBlock = false;
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    if (/^- \[ \] /.test(line)) {
      inUncheckedBlock = true;
      todoLines.push(line);
    } else if (inUncheckedBlock && /^\s{2,}/.test(line)) {
      // Indented continuation of unchecked item
      todoLines.push(line);
    } else {
      inUncheckedBlock = false;
    }
  }
  if (todoLines.length === 0) return null;

  var todoContent = todoLines.join("\n");

  // Check for cross-project references in unchecked TODOs only
  var issues = [];

  // Pattern 1: Explicit "cross-project" marker (standalone phrase, not part of
  // hyphenated compound words like workflow names e.g. "cross-project-reset")
  if (/cross-project(?![-\w])/i.test(todoContent)) {
    issues.push("Contains 'cross-project' marker");
  }

  // Pattern 2: "New project:" suggesting work belongs elsewhere
  if (/[Nn]ew project[: ]/i.test(todoContent)) {
    issues.push("References a new project (write TODOs there instead)");
  }

  // Pattern 3: References to other project paths under PROJECTS_ROOT
  if (PROJECTS_ROOT) {
    // Extract the current project's folder name
    var currentName = path.basename(currentProject).toLowerCase();

    // Dynamically discover sibling project directories under PROJECTS_ROOT
    // instead of hardcoding prefixes. Looks for subdirectories that contain
    // other projects (directories with TODO.md, .git, or package.json).
    try {
      var rootEntries = fs.readdirSync(PROJECTS_ROOT.replace(/\//g, path.sep));
      for (var i = 0; i < rootEntries.length; i++) {
        var entry = rootEntries[i];
        if (entry.toLowerCase() === currentName) continue; // skip self
        // Check if this entry appears as a path reference in the TODO content
        var entrySlash = entry + "/";
        if (todoContent.indexOf(entrySlash) >= 0 || todoContent.indexOf(entry + "\\") >= 0) {
          issues.push("References path '" + entrySlash + "' (belongs in that project's TODO)");
          break;
        }
      }
    } catch (e) { /* can't read PROJECTS_ROOT, skip this check */ }

    // Pattern 4: Phrases like "in hook-runner", "needs commit there", "done in <project>"
    var crossPhrases = [
      /\bdone in (\w[\w-]*),?\s+needs/i,
      /\bneeds? commit (?:in|there)/i,
      /\bin ([\w-]+)\/TODO/i,
    ];
    for (var j = 0; j < crossPhrases.length; j++) {
      if (crossPhrases[j].test(todoContent)) {
        issues.push("Contains cross-project work phrase ('" + todoContent.match(crossPhrases[j])[0] + "')");
        break;
      }
    }
  }

  if (issues.length === 0) return null;

  return {
    decision: "block",
    reason: "[cross-project-todo-gate] BLOCKED: Writing cross-project TODO items into this project's TODO.md.\n" +
      "Issues: " + issues.join("; ") + "\n\n" +
      "DO THIS INSTEAD:\n" +
      "1) Write the TODO items to the OTHER project's TODO.md (allowed by cwd-drift-detector)\n" +
      "2) Only write items that belong to THIS project (" + path.basename(currentProject) + ") in this TODO.md\n" +
      "3) If the other project doesn't exist yet, create it first with project-maker, then write its TODO.md"
  };
};
