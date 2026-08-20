# Lantern Echo sample extension

This intentionally small package demonstrates CozyVTT's sandboxed extension
contract without importing third-party code into the backend process.

It contributes:

- one agent tool, `lantern_echo`, backed by the `lantern.echo` command;
- one complete, data-only semantic theme, `lantern-night`;
- a versioned NDJSON runner that handles lifecycle and command requests.

Install it from **Admin → Extensions** using the `SANDBOXED` mode. The agent
tool remains unavailable until an administrator grants the extension's
`campaign.read` permission for the agent and campaign. Its `read` risk level
does not require human confirmation.

The package checksum covers this README and `runner.js`. If either file changes,
recompute the checksum before installing the package.
