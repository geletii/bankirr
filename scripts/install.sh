#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Bankirr"
BUNDLE_NAME="${APP_NAME}.app"
APP_DIR="$ROOT_DIR/dist/$BUNDLE_NAME"
INSTALL_PATH="/Applications/$BUNDLE_NAME"

cd "$ROOT_DIR"

"$ROOT_DIR/scripts/build-app.sh"

if [[ -d "$INSTALL_PATH" ]]; then
  rm -rf "$INSTALL_PATH"
fi

/usr/bin/ditto "$APP_DIR" "$INSTALL_PATH"
/usr/bin/xattr -dr com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true
open "$INSTALL_PATH"

echo "Installed $INSTALL_PATH"
