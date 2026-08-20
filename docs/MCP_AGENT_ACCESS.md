# MCP agent access

CozyVTT exposes its existing campaign-safe agent capabilities through MCP
Streamable HTTP. This is a transport adapter for the VTT's application
commands and queries; it is not a general server-control API and has no
relationship to a package marketplace.

## Configure access

1. The delegated user opens **Profile → Agent Access**, chooses a campaign,
   and issues a credential. Copy the plaintext token when it is shown; CozyVTT
   stores only its SHA-256 digest.
2. An administrator grants that credential `READ` and/or `EXECUTE` for
   `cozyvtt.core-agent` in the selected campaign. Installed extension tools
   require their own extension-specific grants.
3. Point an MCP client at:

   ```text
   https://your-cozyvtt.example/api/mcp/campaigns/CAMPAIGN_ID
   ```

   Send the issued value as `Authorization: Bearer TOKEN`. Use HTTPS outside a
   loopback development environment. Optionally set `MCP_ALLOWED_HOSTS` to a
   comma-separated exact host/port allowlist.

A representative client entry is:

```json
{
  "mcpServers": {
    "cozyvtt": {
      "type": "http",
      "url": "https://your-cozyvtt.example/api/mcp/campaigns/CAMPAIGN_ID",
      "headers": {
        "Authorization": "Bearer ISSUED_TOKEN"
      }
    }
  }
}
```

The exact configuration wrapper varies by client; the endpoint and header do
not.

## What the client sees

Tool discovery is calculated for the credential on each request:

- `query_*` tools come from the finite production query host and are read-only;
- `command_*` tools are built-in application commands allowed to agents; and
- `extension_*` tools come from active local extensions and are filtered by
  their exact campaign grant.

Arguments cannot change the credential's campaign scope. Write tools require
an idempotency key. A protected operation returns a pending confirmation rather
than executing immediately. The delegated human approves it in CozyVTT, then
the client retries with the one-time receipt. The receipt is bound to the
credential, user, campaign, extension, command, and canonical input digest.

Audit records contain identities, decisions, and input digests—not bearer
tokens, raw command inputs, or result payloads. Revoking the credential or
removing the user's campaign membership invalidates future MCP requests.
