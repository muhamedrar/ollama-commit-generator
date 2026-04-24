#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to read package.json." >&2
  exit 1
fi

PACKAGE_NAME="$(node -p "require('./package.json').name")"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"

if [[ -z "$PACKAGE_NAME" || -z "$PACKAGE_VERSION" ]]; then
  echo "Error: package.json must define both name and version." >&2
  exit 1
fi

echo "Packaging KodeCommit VSIX..."

if command -v npx >/dev/null 2>&1; then
  set +o pipefail
  printf 'y\n' | npx @vscode/vsce package --allow-star-activation --out "${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"
  set -o pipefail
else
  echo "Error: npx is required to package the extension." >&2
  exit 1
fi

echo "Packaged: $(pwd)/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"
