# Security

Bankirr for macOS is a **read-only** portfolio viewer. It does not ask for seed phrases, private keys, or transaction signing.

## Report a problem

If you find a security issue, contact the maintainer privately or open a GitHub issue **without** public exploit details until it is fixed.

## Data on your Mac

| What | Where |
|------|--------|
| Session after sign-in | `~/Library/Application Support/BankirrStatusBarApp/auth-token` |
| Saved wallets | `~/Library/Application Support/BankirrStatusBarApp/wallets.json` |

**Sign out** clears the session token. For network access and permissions, see [TRANSPARENCY.md](TRANSPARENCY.md).

## Trust a download

- **Build from source:** `./scripts/install.sh`
- **Pre-built release:** compare `shasum -a 256 Bankirr.zip` with `SHA256SUMS` on [GitHub Releases](https://github.com/geletii/bankirr/releases)
