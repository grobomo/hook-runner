// Block Write/Edit with hardcoded absolute paths in file content.
// Catches C:\Users\..., /home/..., /Users/... in new_string/content.
// Absolute paths break portability — use variables or relative paths.

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var ti = input.tool_input || {};

  // Check the content being written/edited (not the file_path — that's fine)
  var text = "";
  if (tool === "Write") text = ti.content || "";
  if (tool === "Edit") text = ti.new_string || "";

  if (!text) return null;

  // Patterns for hardcoded absolute paths in content
  // Windows: C:\Users\username\... or C:/Users/username/...
  var winPath = /[A-Z]:[\\\/]Users[\\\/]\w+[\\\/]/i;
  // Linux: /home/username/...
  var linuxPath = /\/home\/\w+\//;
  // macOS: /Users/username/...
  var macPath = /\/Users\/\w+\//;

  // Allow common false positives:
  // - Comments (lines starting with // or #)
  // - Strings that are clearly examples/docs (e.g. in README, SKILL.md)
  // - Error messages / stack traces in test expectations
  var filePath = ti.file_path || "";
  var ext = filePath.split(".").pop().toLowerCase();
  if (ext === "md" || ext === "txt" || ext === "html") return null;

  // Check each line — skip comment lines
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // Skip comments
    if (/^(\/\/|#|\/\*|\*|<!--)/.test(line)) continue;
    // Skip string literals that look like path examples
    if (/["'].*example.*["']/i.test(line)) continue;

    var match = null;
    if (winPath.test(line)) match = line.match(winPath);
    else if (linuxPath.test(line)) match = line.match(linuxPath);
    else if (macPath.test(line)) match = line.match(macPath);

    if (match) {
      return {
        decision: "block",
        reason: "HARDCODED PATH DETECTED in " + tool + " content.\n" +
          "Found: " + match[0] + "\n" +
          "Use a variable (HOME, __dirname, process.cwd()) or relative path instead.\n" +
          "Hardcoded absolute paths break portability across machines."
      };
    }
  }

  return null;
};
