// WHY: Claude deleted files that turned out to be needed later.
// Block destructive delete commands. Always archive, never delete.
// Returns null to pass, {decision:"block", reason:"..."} to block.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";

  // Normalize: collapse whitespace, trim
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Patterns that destroy files/directories
  var destructive = [
    /\brm\s+-rf\b/,
    /\brm\s+-fr\b/,
    /\brm\s+-r\b/,
    /\brm\s+--recursive\b/,
    /\brm\b(?!.*\.log\b)(?!.*\.tmp\b)(?!.*node_modules\b)(?!.*__pycache__\b)(?!.*\.pyc\b)/,
    /\brmdir\b/,
    /\bdel\s+\/[sS]\b/i,
    /\brd\s+\/[sS]\b/i,
  ];

  // Exceptions: deleting generated/cache files is fine
  var exceptions = [
    /node_modules/,
    /\.pyc$/,
    /__pycache__/,
    /\.log$/,
    /\.tmp$/,
    /\.cache/,
    /\/tmp\//,
    /\btmp\b.*\brm\b/,
    /dist\//,
    /build\//,
  ];

  for (var i = 0; i < destructive.length; i++) {
    if (destructive[i].test(normalized)) {
      // Check exceptions
      for (var j = 0; j < exceptions.length; j++) {
        if (exceptions[j].test(normalized)) return null;
      }
      return {
        decision: "block",
        reason: "BLOCKED: Destructive delete detected. NEVER delete files or directories. Move to archive/ instead. Use: mv <path> archive/ (create archive/ if needed, add to .gitignore). Command was: " + cmd.substring(0, 200)
      };
    }
  }

  return null;
};
