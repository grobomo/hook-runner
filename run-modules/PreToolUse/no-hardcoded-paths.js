// Block Write/Edit with hardcoded absolute user paths in file content.
// Catches Windows, Linux, and macOS home directory paths in new_string/content.
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
  var winPath = /[A-Z]:[\\\/]Users[\\\/]\w+[\\\/]/i;  // Windows home dirs
  var linuxPath = /\/home\/\w+\//;                      // Linux home dirs
  var macPath = /\/Users\/\w+\//;                       // macOS home dirs

  // Allow common false positives:
  // - Comments (lines starting with // or #)
  // - Strings that are clearly examples/docs (e.g. in README, SKILL.md)
  // - Error messages / stack traces in test expectations
  var filePath = ti.file_path || "";
  var ext = filePath.split(".").pop().toLowerCase();
  if (ext === "md" || ext === "txt" || ext === "html") return null;
  // CloudFormation/Docker templates legitimately reference /home/ubuntu on EC2
  if (/cloudformation[\\\/]/i.test(filePath) && (ext === "yaml" || ext === "yml")) return null;
  if (/Dockerfile/i.test(filePath.split(/[\\\/]/).pop())) return null;

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
