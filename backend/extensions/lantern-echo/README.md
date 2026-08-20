# Lantern Echo sample extension

This intentionally small local package demonstrates CozyVTT's extension
contracts without relying on a package store or remote catalogue.

It contributes:

- one agent tool, `lantern_echo`, backed by the `lantern.echo` command;
- one complete, data-only semantic theme, `lantern-night`;
- one browser-side overlay renderer, `lantern-glow`;
- a versioned NDJSON runner that handles lifecycle and command requests.

Install it in **SANDBOXED** mode to run only the isolated agent tool and theme.
Install it in explicitly approved **TRUSTED** mode to additionally load the
reviewed browser renderer. Sandboxed installations never execute browser code.
The agent tool remains unavailable until an administrator grants the
extension's `campaign.read` permission for the agent and campaign.

The package checksum covers this README, `runner.js`, and `renderer.mjs`. If a
covered file changes, recompute the checksum before installing the package.

Trusted mode deliberately requires an operator review step. After reviewing
the files, add the exact id/version/checksum tuple to
`TRUSTED_EXTENSION_ALLOWLIST`, calculate an HMAC-SHA256 over these three lines
using `TRUSTED_EXTENSION_REVIEW_KEY`, and place
`hmac-sha256:<hex digest>` in the package descriptor's `signature` field:

```text
cozyvtt.sample-lantern
1.0.0
sha256:<the current package checksum>
```

The signature is deployment-specific; the repository intentionally does not
ship a universal trusted signature or review key.
