#!/usr/bin/env bash
# Pre-push secret scanner for the Mac client repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

warn() { echo "FAIL: $*" >&2; FAIL=1; }
ok()   { echo "OK:   $*"; }

PATTERNS=(
  'sk_live_[a-zA-Z0-9]+'
  'sk_test_[a-zA-Z0-9]+'
  'whsec_[a-zA-Z0-9]+'
  're_[a-zA-Z0-9]{20,}'
  '127\.0\.0\.1:7791/ingest'
)

SCAN_FILES=()
while IFS= read -r -d '' file; do
  SCAN_FILES+=("$file")
done < <(find . -type f \
  ! -path './.build*/*' \
  ! -path './dist/*' \
  ! -path './.git/*' \
  ! -path './.cursor/*' \
  \( -name '*.swift' -o -name '*.js' -o -name '*.html' -o -name '*.sh' -o -name '*.md' -o -name '*.plist' -o -name '*.json' \) \
  -print0 2>/dev/null)

for pattern in "${PATTERNS[@]}"; do
  hit=0
  for file in "${SCAN_FILES[@]}"; do
    if grep -qE "$pattern" "$file" 2>/dev/null; then
      warn "pattern '$pattern' in $file"
      hit=1
    fi
  done
  if [[ $hit -eq 0 ]]; then
    ok "no matches for pattern '$pattern'"
  fi
done

if [[ -d dist ]] && find dist -name '*.app' -print -quit 2>/dev/null | grep -q .; then
  warn "dist/ contains a built .app — do not commit release artifacts"
else
  ok "no built .app in dist/"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All checks passed."
  exit 0
else
  echo "Checks failed. Fix issues above before publishing."
  exit 1
fi
