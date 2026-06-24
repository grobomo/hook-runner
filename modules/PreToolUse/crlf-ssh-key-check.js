// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Windows scp/cp adds \r\n to SSH keys. OpenSSH rejects them with
// "error in libcrypto". This happened repeatedly with fleet key deployment.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Detect SSH key upload/copy operations
  if (/(scp|cp)\s+.*\.pem/.test(cmd) || /(scp|cp)\s+.*key/.test(cmd) ||
      /aws\s+s3\s+cp.*key/.test(cmd)) {
    return {
      decision: "block",
      reason: "BLOCKED: SSH key upload containing CRLF line endings\nWHY: Windows tools may add carriage returns to SSH keys, causing OpenSSH to reject authentication\nNEXT STEPS:\n1. Convert the key file using dos2unix or sed to remove \\r\\n characters\n2. Verify the key contains only LF line endings before uploading\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix crlf-ssh-key-check — {describe the issue}\""
    };
  }

  return null;
};
