# MCP access

CozyVTT exposes its campaign-safe commands and queries through MCP Streamable
HTTP. The MCP adapter is part of the local VTT; it is unrelated to a package
store or marketplace.

## Connect once

The server has one stable MCP URL:

```text
https://your-cozyvtt.example/api/mcp
```

Open **Profile → MCP connections** to copy that URL or download a small MCP
configuration file. Add it to the client without headers, API keys, or other
secrets.

On first connection the MCP client follows standard OAuth discovery and opens
CozyVTT in the browser. Sign in normally if necessary, choose one of your
campaigns, and click **Allow connection**. That is the complete authorization
flow. The client receives and refreshes its own credentials; the user never
copies or stores them manually.

There is no administrator grant step. The connection acts as the approving
user in the chosen campaign, and the ordinary CozyVTT DM/player/spectator
rules remain authoritative. Removing that user from the campaign or clicking
**Disconnect** in Profile ends access.

For loopback development the default endpoint is:

```text
http://localhost:4000/api/mcp
```

Set `MCP_PUBLIC_URL` to the externally reachable endpoint when deployed behind
a reverse proxy. Use HTTPS outside localhost. `MCP_ALLOWED_HOSTS` may restrict
the accepted HTTP Host header but does not add any user-facing setup steps.

## What happens automatically

An unauthenticated MCP request receives an RFC 9728 protected-resource
challenge. A compatible client then:

1. discovers CozyVTT's authorization server metadata;
2. dynamically registers itself as a public PKCE client;
3. opens the existing CozyVTT login/approval page;
4. exchanges the approved code for rotating OAuth credentials; and
5. reconnects to `/api/mcp` with the selected campaign already bound.

The browser decision is stored durably, authorization codes are short-lived
and hash-only, and access and refresh credentials are stored only as SHA-256
digests. Those are implementation details, not tasks imposed on the user.

## Tools and approval

- `query_*` tools are read-only views from the production query host.
- `command_*` tools call the built-in application command host.
- `extension_*` tools come from active, locally installed extensions.

Installed extension tools do not require separate user or administrator
grants. They run as the same delegated campaign member through the extension
bridge and remain constrained by their manifest, command binding, sandbox or
trusted execution mode, and the application's domain authorization.

Arguments cannot change the selected campaign. Writes use idempotency keys.
Built-in campaign tools do not impose per-action approval prompts: the one-time
OAuth connection and the delegated user's existing campaign role are the
authorization. The confirmation protocol remains available to an explicitly
installed extension that declares a genuinely exceptional operation, but it is
not part of ordinary MCP play or GMing.

Audit records contain identities, decisions, and canonical input digests—not
OAuth credentials, raw command input, or result payloads.

## Import a battle map

The built-in `command_map_import-remote` tool downloads a PNG, JPEG, or WebP
map from a public HTTP(S) URL, creates the campaign asset and map, and can make
it the current map in one MCP call. The client supplies the map name, grid
dimensions, grid size, distance rules, source URL, and an idempotency key; it
does not supply a campaign ID because the OAuth connection is already bound to
one campaign.

Remote ingress rejects loopback and private-network destinations, follows at
most four redirects, enforces a size limit and timeout, checks the downloaded
file signature, and compensates partial asset/map/file writes on failure. The
command uses the approving user's normal campaign role and does not require a
separate administrator grant or per-call confirmation.

## First-class campaign roles

MCP and the sibling JSON agent API expose the same typed application tools.
They are not browser macros and do not simulate clicks.

- A **player agent** can create a real character, place a self-controlled
  player actor, move and update actors it controls, adjust its character HP,
  speak in character, roll dice, and read the campaign state available to that
  player.
- An **NPC agent** is represented by a controlled map actor. It can move,
  change state, speak under the NPC's name, and make public or secret rolls.
  Audit data still records the delegated human/service identity behind it.
- A **GM agent** can create and control player or NPC actors, run initiative,
  activate or import maps, manage fog/walls/lights, set atmosphere/audio/vibe,
  and start, pause, resume, or end sessions.
- A **system agent** uses the same explicit GM/system application tools for
  orchestration. It does not receive a raw database, shell, HTTP, or Socket.IO
  escape hatch.

Every successful mutation publishes the same campaign events as the human UI
path, so connected human players see agent actions live. The public catalogue
is also available to locally installed extensions: trusted extensions call the
campaign-scoped `context.core` gateway, while sandboxed extensions return
bounded declarative `coreActions`. Both paths resolve to these same application
handlers and campaign-role checks.
