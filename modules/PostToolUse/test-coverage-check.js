// WHY: Source files were modified but existing tests never ran, hiding regressions.
// PostToolUse: warn when source files are modified but tests exist that should be run
// Triggers after Edit or Write tool completions.
// If the modified file has a corresponding test file, reminds to run it.
var path = require("path");
var fs = require("fs");

// Common test directory patterns
var TEST_DIRS = ["scripts/test", "test", "tests", "__tests__", "spec"];
// Common test file patterns
var TEST_PREFIXES = ["test-", "test_"];
var TEST_SUFFIXES = [".test.js", ".test.ts", ".spec.js", ".spec.ts", "_test.go", "_test.py"];

module.exports = function(input) {
  var toolName = input.tool_name || "";
  if (toolName !== "Edit" && toolName !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  if (!filePath) return null;

  var basename = path.basename(filePath);
  var dirName = path.dirname(filePath);

  // Skip if the file itself is a test file — no need to remind
  var isTestFile = TEST_PREFIXES.some(function(p) { return basename.startsWith(p); }) ||
    TEST_SUFFIXES.some(function(s) { return basename.endsWith(s); }) ||
    TEST_DIRS.some(function(d) { return filePath.replace(/\\/g, "/").indexOf("/" + d + "/") !== -1; });

  if (isTestFile) return null;

  // Skip non-code files
  var ext = path.extname(basename).toLowerCase();
  var codeExts = [".js", ".ts", ".py", ".go", ".rs", ".java", ".sh", ".bash"];
  if (codeExts.indexOf(ext) === -1) return null;

  // Look for corresponding test files
  var projectDir = process.env.CLAUDE_PROJECT_DIR || dirName;
  var nameNoExt = basename.replace(/\.[^.]+$/, "");
  var found = [];

  // Check scripts/test/ for test-<name>* pattern
  for (var di = 0; di < TEST_DIRS.length; di++) {
    var testDir = path.join(projectDir, TEST_DIRS[di]);
    if (!fs.existsSync(testDir)) continue;
    var files;
    try { files = fs.readdirSync(testDir); } catch(e) { continue; }
    for (var fi = 0; fi < files.length; fi++) {
      var lower = files[fi].toLowerCase();
      var nameCheck = nameNoExt.toLowerCase();
      if (lower.indexOf(nameCheck) !== -1) {
        found.push(path.join(TEST_DIRS[di], files[fi]));
      }
    }
  }

  // Check same directory for <name>.test.* or test_<name>.*
  try {
    var siblings = fs.readdirSync(dirName);
    for (var si = 0; si < siblings.length; si++) {
      var sib = siblings[si];
      if (sib === basename) continue;
      var sibLower = sib.toLowerCase();
      if ((sibLower.startsWith("test-" + nameNoExt.toLowerCase()) ||
           sibLower.startsWith("test_" + nameNoExt.toLowerCase()) ||
           sibLower === nameNoExt.toLowerCase() + ".test.js" ||
           sibLower === nameNoExt.toLowerCase() + ".test.ts" ||
           sibLower === nameNoExt.toLowerCase() + ".spec.js" ||
           sibLower === nameNoExt.toLowerCase() + ".spec.ts")) {
        found.push(path.join(path.relative(projectDir, dirName) || ".", sib));
      }
    }
  } catch(e) { /* ignore */ }

  if (found.length === 0) return null;

  // Deduplicate
  var unique = [];
  for (var ui = 0; ui < found.length; ui++) {
    if (unique.indexOf(found[ui]) === -1) unique.push(found[ui]);
  }

  return {
    decision: "block",
    reason: "Modified " + basename + " — related test file(s) found: " + unique.join(", ") + ". Run tests before committing."
  };
};
