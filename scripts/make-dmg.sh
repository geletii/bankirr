#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Bankirr"
BUNDLE_NAME="${APP_NAME}.app"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/$BUNDLE_NAME"
DMG_PATH="$DIST_DIR/${APP_NAME}.dmg"
STAGING_DIR="$DIST_DIR/dmg-staging"

cd "$ROOT_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  "$ROOT_DIR/scripts/build-app.sh"
fi

rm -rf "$STAGING_DIR" "$DMG_PATH"
mkdir -p "$STAGING_DIR"
cp -R "$APP_DIR" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"
cp "$ROOT_DIR/scripts/dmg-README.txt" "$STAGING_DIR/README.txt"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$STAGING_DIR"

echo "Created $DMG_PATH"
