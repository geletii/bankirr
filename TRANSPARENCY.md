# Transparency — what Bankirr does on your Mac

This document lists every network connection, file write, and permission the menu bar app uses. The full source code is published so you can verify this yourself.

## What the app does

Bankirr is a read-only portfolio viewer. You add **public wallet addresses** (or ENS names). The native app fetches balances and market data **only from the Bankirr API** (`https://bankirr.xyz` by default). Portfolio math and external data sources (RPC, price feeds) run on the server, not inside the menu bar binary. The app does **not** ask for seed phrases, private keys, or transaction signing.

## Network connections

| Destination | When | Data sent |
|-------------|------|-----------|
| Bankirr API (`https://bankirr.xyz` or `BANKIRR_API_BASE_URL`) | Auth, subscription, wallet sync, portfolio, ETH/gas market | JWT (after login), wallet addresses, device ID |
| `{base}/download/version.json` and `{base}/download/Bankirr.zip` | In-app update only | None (download) |
| `http://127.0.0.1:38473` | Browser sign-in handoff only | JWT in query string on localhost |
| Bankirr web (`{base}/little/connect.html`, dashboard, pricing) | User opens links in the browser | Depends on page (sign-in, subscription) |

The menu bar app does **not** call CoinGecko, public RPC, or other third-party APIs directly.

There is **no** analytics, crash reporting, or third-party telemetry SDK.

## Local files

| Path | Contents | Permissions |
|------|----------|-------------|
| `~/Library/Application Support/BankirrStatusBarApp/auth-token` | Session JWT after sign-in | `0600` |
| `~/Library/Application Support/BankirrStatusBarApp/wallets.json` | Saved wallet list | default |
| `UserDefaults` | Device ID, onboarding flag, demo timer start | standard |

## What the app does NOT use

- macOS Keychain (legacy items are deleted once without reading)
- Access to files outside Application Support (except the installed `.app` bundle)
- Embedded server API keys or Stripe/Resend secrets
- Bundled web dashboard runtime (`app.js` lives at the monorepo root for the server; the native app does not ship or load it)
- Background processes after quit (menu bar app exits cleanly)

## Verify before you trust a binary

1. **Build from source** (recommended): `git clone … && ./scripts/install.sh`
2. **GitHub Release**: compare `shasum -a 256 Bankirr.zip` with `SHA256SUMS` in the release
3. **Read `install.sh`** before `curl | bash`

## Report a concern

Open a GitHub issue or email the maintainer. For suspected security bugs, avoid public exploit details until fixed.
