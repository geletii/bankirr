#!/usr/bin/env bash
set -euo pipefail

# Verifies Mac release artifacts are Developer ID signed and notarized/stapled.
# Called before copying to public/download/ or uploading to R2/GitHub Releases.
#
# Usage:
#   export SIGN_IDENTITY="Developer ID Application: …"
#   ./scripts/verify-signed-artifacts.sh <Bankirr.app> <Bankirr.dmg>
#
# For local ad-hoc testing, use build-app.sh + install.sh — never this script.

APP_DIR="${1:-}"
DMG_PATH="${2:-}"

if [[ -z "$APP_DIR" || -z "$DMG_PATH" ]]; then
  echo "Usage: verify-signed-artifacts.sh <Bankirr.app> <Bankirr.dmg>" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "App bundle not found: $APP_DIR" >&2
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "DMG not found: $DMG_PATH" >&2
  exit 1
fi

if [[ "${SIGN_IDENTITY:--}" == "-" ]]; then
  echo "SIGN_IDENTITY is ad-hoc — refusing to publish unsigned artifacts." >&2
  echo "Set SIGN_IDENTITY to your Developer ID Application certificate." >&2
  exit 1
fi

if [[ "$SIGN_IDENTITY" != *"Developer ID Application"* ]]; then
  echo "SIGN_IDENTITY must be a Developer ID Application certificate." >&2
  echo "Got: $SIGN_IDENTITY" >&2
  exit 1
fi

if ! codesign --verify --deep --strict "$APP_DIR" 2>/dev/null; then
  echo "App failed codesign verification: $APP_DIR" >&2
  exit 1
fi

# Capture first: `grep -q` closes the pipe early, codesign gets SIGPIPE (141),
# and with `set -o pipefail` the whole check looks like a signing failure.
codesign_info="$(codesign -dv --verbose=2 "$APP_DIR" 2>&1 || true)"
if ! grep -q "Authority=Developer ID Application" <<<"$codesign_info"; then
  echo "App is not signed with Developer ID Application: $APP_DIR" >&2
  exit 1
fi

if ! xcrun stapler validate "$APP_DIR" >/dev/null 2>&1; then
  echo "App is not notarized/stapled: $APP_DIR" >&2
  echo "Users installing the .zip would see macOS Gatekeeper alerts." >&2
  exit 1
fi

if ! xcrun stapler validate "$DMG_PATH" >/dev/null 2>&1; then
  echo "DMG is not notarized/stapled: $DMG_PATH" >&2
  echo "Users downloading the .dmg would see macOS Gatekeeper alerts." >&2
  exit 1
fi

echo "Verified Developer ID signed + notarized: $APP_DIR and $DMG_PATH"
