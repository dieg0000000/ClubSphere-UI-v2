#!/usr/bin/env bash
# Fail the build if any .tsx/.ts source file in src/ contains Unicode escape
# sequences (\uXXXX) inside JSX text or string literals. These should be
# written as real UTF-8 characters so labels render correctly.

set -euo pipefail

MATCHES=$(grep -rn '\\u[0-9a-fA-F]\{4\}' src/ --include='*.tsx' --include='*.ts' 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo ""
  echo "ERROR: Unicode escape sequences found in source files."
  echo "Replace \\uXXXX with the actual UTF-8 character (é, è, à, î, ç, etc.)."
  echo ""
  echo "$MATCHES"
  echo ""
  exit 1
fi
