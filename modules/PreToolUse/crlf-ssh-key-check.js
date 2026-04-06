// WORKFLOW: shtd
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
      reason: "SSH KEY CRLF CHECK: Windows adds \\r\\n to SSH keys which breaks OpenSSH.\n" +
        "Always pipe through tr -d '\\r' before uploading to Linux hosts or S3.\n" +
        "Example: tr -d '\\r' < key.pem | ssh user@host 'cat > ~/.ssh/key.pem'"
    };
  }

  return null;
};
