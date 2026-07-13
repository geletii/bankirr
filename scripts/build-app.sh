#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Bankirr"
BUNDLE_NAME="${APP_NAME}.app"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/$BUNDLE_NAME"
BINARY_NAME="BankirrStatusBarApp"

cd "$ROOT_DIR"

# Universal build: Apple Silicon (arm64) + Intel (x86_64).
# We build each architecture into its own scratch dir and lipo them together.
# This avoids `swift build --arch ...`, which requires a full Xcode install
# (xcbuild); the approach below works with just the Command Line Tools.
MACOS_MIN="13.0"
ARM_SCRATCH="$ROOT_DIR/.build-arm64"
X86_SCRATCH="$ROOT_DIR/.build-x86_64"

echo "Building arm64…"
swift build -c release --scratch-path "$ARM_SCRATCH" \
  -Xswiftc -target -Xswiftc "arm64-apple-macosx$MACOS_MIN"

echo "Building x86_64…"
swift build -c release --scratch-path "$X86_SCRATCH" \
  -Xswiftc -target -Xswiftc "x86_64-apple-macosx$MACOS_MIN"

ARM_BIN="$ARM_SCRATCH/release/$BINARY_NAME"
X86_BIN="$X86_SCRATCH/release/$BINARY_NAME"

for b in "$ARM_BIN" "$X86_BIN"; do
  if [[ ! -f "$b" ]]; then
    echo "Release binary not found at $b" >&2
    exit 1
  fi
done

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"

# Combine the two single-arch binaries into one universal binary.
lipo -create "$ARM_BIN" "$X86_BIN" -output "$APP_DIR/Contents/MacOS/$BINARY_NAME"
cp "$ROOT_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"
mkdir -p "$APP_DIR/Contents/Resources"
if [[ -f "$ROOT_DIR/Resources/AppIcon.icns" ]]; then
  cp "$ROOT_DIR/Resources/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
fi

chmod +x "$APP_DIR/Contents/MacOS/$BINARY_NAME"

# Code signature. Default: ad-hoc (`-`), no Apple Developer account needed.
# For distribution, set SIGN_IDENTITY to your Developer ID Application, e.g.:
#   export SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

# Strip extended attributes that can break codesign after manual bundle assembly.
xattr -cr "$APP_DIR"

if [[ "$SIGN_IDENTITY" == "-" ]]; then
  codesign --force --deep --sign - --timestamp=none "$APP_DIR"
  SIGN_LABEL="ad-hoc signed"
else
  codesign --force --deep --options runtime \
    --sign "$SIGN_IDENTITY" \
    --timestamp \
    "$APP_DIR"
  SIGN_LABEL="signed with $SIGN_IDENTITY"
fi

codesign --verify --deep --strict "$APP_DIR"

echo "Built $APP_DIR (universal: arm64 + x86_64, $SIGN_LABEL)"
