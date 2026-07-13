#!/usr/bin/env bash
set -euo pipefail

# Submit a .dmg (or .zip) to Apple notarization and staple the ticket.
#
# Authentication (preferred): App Store Connect API key, passed as env vars.
# This avoids the notarytool keychain profile, which we found could silently
# stop being readable ("No Keychain password item found") mid-session.
#
#   export ASC_KEY="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8"
#   export ASC_KEY_ID="XXXXXXXXXX"
#   export ASC_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#   ./scripts/notarize-dmg.sh dist/Bankirr.dmg
#
# Fallback: a stored keychain profile via NOTARY_PROFILE=bankirr-notary.
#
# Why we don't use `notarytool submit --wait`: on a flaky connection the
# long-lived poll dies with NSURLErrorTimedOut (-1001) and, under `set -e`,
# takes the whole release down even though the submission is fine on Apple's
# side. We submit with --no-wait and poll `info` with retries instead.
#
# Note: the FIRST notarization for a brand-new Apple Developer account can sit
# in "In Progress" for many hours while Apple vets the account. That is normal;
# subsequent submissions finish in minutes.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT="${1:-$ROOT_DIR/dist/Bankirr.dmg}"

ASC_KEY="${ASC_KEY:-}"
ASC_KEY_ID="${ASC_KEY_ID:-}"
ASC_ISSUER="${ASC_ISSUER:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"

# How long to keep polling for a final status, and how often (seconds).
POLL_INTERVAL="${NOTARY_POLL_INTERVAL:-25}"
POLL_MAX_MINUTES="${NOTARY_POLL_MAX_MINUTES:-180}"

# Assemble the credential flags once; every notarytool call reuses them.
CRED_ARGS=()
if [[ -n "$ASC_KEY" && -n "$ASC_KEY_ID" && -n "$ASC_ISSUER" ]]; then
  if [[ ! -f "$ASC_KEY" ]]; then
    echo "ASC_KEY file not found: $ASC_KEY" >&2
    exit 1
  fi
  CRED_ARGS=(--key "$ASC_KEY" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER")
  AUTH_LABEL="API key $ASC_KEY_ID"
elif [[ -n "$NOTARY_PROFILE" ]]; then
  CRED_ARGS=(--keychain-profile "$NOTARY_PROFILE")
  AUTH_LABEL="keychain profile $NOTARY_PROFILE"
else
  echo "No notarization credentials." >&2
  echo "Set ASC_KEY / ASC_KEY_ID / ASC_ISSUER (preferred), or NOTARY_PROFILE." >&2
  exit 1
fi

if [[ ! -f "$ARTIFACT" ]]; then
  echo "Artifact not found: $ARTIFACT" >&2
  exit 1
fi

echo "Submitting $ARTIFACT for notarization ($AUTH_LABEL)…"
SUBMIT_OUT="$(xcrun notarytool submit "$ARTIFACT" "${CRED_ARGS[@]}" --no-wait 2>&1)"
echo "$SUBMIT_OUT"
SUB_ID="$(printf '%s\n' "$SUBMIT_OUT" | awk '/id:/{print $2; exit}')"
if [[ -z "$SUB_ID" ]]; then
  echo "Could not parse submission id from notarytool output." >&2
  exit 1
fi

echo "Polling submission $SUB_ID (up to ${POLL_MAX_MINUTES}m)…"
DEADLINE=$(( $(date +%s) + POLL_MAX_MINUTES * 60 ))
STATUS=""
while (( $(date +%s) < DEADLINE )); do
  # Tolerate transient network timeouts: a failed poll just retries.
  STATUS="$(xcrun notarytool info "$SUB_ID" "${CRED_ARGS[@]}" 2>/dev/null \
            | awk '/status:/{print $2; exit}')"
  case "$STATUS" in
    Accepted) break ;;
    Invalid|Rejected)
      echo "Notarization failed with status: $STATUS" >&2
      xcrun notarytool log "$SUB_ID" "${CRED_ARGS[@]}" 2>&1 || true
      exit 1
      ;;
    *) : ;; # In Progress, empty (timeout) — keep waiting
  esac
  sleep "$POLL_INTERVAL"
done

if [[ "$STATUS" != "Accepted" ]]; then
  echo "Timed out after ${POLL_MAX_MINUTES}m; last status: ${STATUS:-unknown}." >&2
  echo "The submission may still finish on Apple's side. Re-run with:" >&2
  echo "  xcrun notarytool info $SUB_ID ${CRED_ARGS[*]}" >&2
  exit 1
fi

echo "Accepted. Stapling notarization ticket…"
xcrun stapler staple "$ARTIFACT"
xcrun stapler validate "$ARTIFACT"

echo "Notarized and stapled: $ARTIFACT"
