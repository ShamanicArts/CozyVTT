# Extension and agent architecture

## Status and scope

CozyVTT ships a controlled local-extension runtime, durable audit/idempotency
foundations, OAuth-connected HTTP and MCP transports, and runtime renderer/theme
contributions. Its purpose is to make one self-hosted VTT easy to adapt for its
operators. A public package marketplace, remote store, publishing platform,
and unreviewed package acquisition are non-goals by design.

The canonical contracts live under `backend/src/extensions/`. Keep transport
details (Express paths, Socket.IO events, Prisma models, SQL, DOM, and React
closures) out of manifests and extension contracts.

The distributable contract surface is `packages/extension-sdk`. A plugin can
depend on that package without importing the VTT repository. The
`cozyvtt-npc-controller` reference implementation lives in its own repository
and is compiled/tested independently.

## Runtime shape

```mermaid
flowchart LR
  Admin[Platform administrator] --> AdminApi[/api/admin/extensions]
  AdminApi --> Host[ExtensionHostService]
  Host --> Store[(ExtensionInstallation)]
  Host --> T[TrustedRegistryProxy]
  Host --> S[SandboxedExtensionSupervisor]
  S --> B[bwrap + Node child]
  T --> R[ExtensionRegistry]
  S --> R
  R --> Bridge[ExtensionCommandBridge]
  Bridge --> EBus[Extension runtime CommandBus]

  User[Campaign user] --> OAuth[One-click OAuth approval]
  OAuth --> Agent[MCP client]
  User --> AgentApi[/api/agent]
  Agent --> McpApi[/api/mcp]
  AgentApi --> Core[Production ApplicationHost]
  McpApi --> Core
  Core --> CoreBus[Shared core CommandBus]
  AgentApi --> Bridge
  McpApi --> Bridge
  Core --> Durable[(membership / audit / idempotency / outbox)]
  Bridge --> Durable
```

There are two execution surfaces:

- The built-in core agent catalog calls `productionApplicationHost`, which
  delegates to the shared core command registry and enforces durable middleware.
- Installed extension tools call `ExtensionCommandBridge` and the extension
  runtime's own registry/command bus. That runtime has delegated-membership and audit
  adapters, but is not yet unified with the core host/outbox transaction path.

Do not describe these as one universal plugin command bus until that joining
layer is designed and tested.

## Manifest contract

`ExtensionManifest` is parsed before lifecycle code runs. The current manifest
version is `1.0` and extension API version is `1.0.0`. A manifest declares an
identifier, version/compatibility ranges, capabilities, permissions, command
descriptors, and optional agent tools.

Capabilities currently model contribution categories such as `commands`,
`agent-tools`, `scene-layers`, `renderers`, `themes`, `game-systems`,
`importers`, and `exporters`. Permissions are finite requested capabilities
such as campaign/map/token/asset/theme access. A declaration is never an
authorization grant. Tool permissions must cover their command permissions,
and high-risk tools cannot request `confirmation: "never"`.

Compatibility is checked before `onInstall`; duplicate extension, command, and
tool identifiers are rejected. The registry lifecycle is install, activate,
deactivate, uninstall. Activation failure leaves an installation inactive;
deactivation failure leaves it active rather than falsely hiding a still-live
contribution. Per-extension concurrent lifecycle transitions are rejected.

## Trust and installation

Packages are discovered below `EXTENSION_PACKAGE_ROOT` with a package manifest
and relative entrypoint. The admin API accepts only a catalogue package ID.
Before a trusted package is imported, the host resolves real paths within the
root, rejects traversal/symlink escape, recomputes checksum, checks the exact
allowlist from `TRUSTED_EXTENSION_ALLOWLIST`, and verifies its signature. The
default verifier uses the review HMAC key in `TRUSTED_EXTENSION_REVIEW_KEY`;
an installation may supply an asymmetric verifier instead. No configuration
means no trusted import.

Persisted installation records retain package identity/digest, parsed
manifest, requested install mode, lifecycle state, and safe error state.
They do not turn a package descriptor into permission to execute arbitrary
server code.

## Sandboxed lifecycle

Sandboxed packages are not dynamically imported into the server process. Each
lifecycle/tool invocation is a fresh Node child communicating over versioned
NDJSON and launched under bubblewrap. The child has a read-only package,
temporary work directory, disabled network, Node read permission only for the
package, and bounded concurrency, duration, heap, stdout, and stderr. Protocol
errors, crashes, and timeouts terminate that child.

Configured active installations are rehydrated before the server starts
listening. This restores lifecycle state but does not create a daemon worker,
automatic restart service, package rollback, CPU/cgroup management, or a
configurable filesystem/network capability system. The supplied Node 24
Docker images include bubblewrap and have a verified unprivileged execution
path. Compose deliberately uses `seccomp=unconfined`, because Docker's default
profile blocks the user namespace bubblewrap requires, while retaining
`no-new-privileges`; deployments that reject that tradeoff should isolate the
sandbox runner or leave the extension root disabled.

## Agents, connection, and confirmation

MCP clients connect to the single `/api/mcp` URL and follow OAuth discovery,
dynamic public-client registration, PKCE, and the existing CozyVTT login. The
user chooses a campaign and clicks Allow once. OAuth authorization codes and
credentials are hash-only at rest; their handling is automatic and never part
of the user's setup. Every call rechecks that the delegated human still belongs
to the selected campaign. Ordinary campaign roles authorize domain behavior;
there is no MCP or per-extension administrator grant step.

Core writes require idempotency. Protected core host commands record canonical
input digests and durable allowed/denied/executed/failed audit entries and
produce transactional outbox events.

An agent can request confirmation but cannot approve it. Only the delegated
human's authenticated session can approve or deny. The client retries with the
already-issued confirmation ID; no receipt or secret is relayed through the
human. The ID is bound to credential, human, campaign, extension, command, and
canonical input digest and is atomically consumed once.

The JSON agent API and Streamable HTTP MCP adapter are sibling transports over
the same delegated identity, command/query, confirmation, idempotency, and
audit boundaries. MCP is mounted at `/api/mcp`; tool discovery includes the
finite core catalogue and active local extension tools. Neither transport is an
arbitrary HTTP proxy, database accessor, shell tool, or raw Socket.IO capability.

The built-in catalogue treats agents as campaign participants rather than
automation scripts. Player, NPC, GM, and system-oriented tools cover actor and
character creation/control, in-world speech and dice, HP/state changes,
initiative, map activation/import, scene fog/walls/lights, atmosphere/audio/
vibe, and session lifecycle. The delegated campaign role remains authoritative.
These core tools execute after the one-time OAuth connection without routine
per-action confirmation prompts.

Installed packages can compose those same capabilities. A trusted handler gets
a campaign-scoped `context.core` gateway for catalogue discovery, commands,
and queries. A sandboxed handler may return a bounded `coreActions` list; the
host validates and dispatches each action through the same gateway after the
sandbox exits. Neither mode receives Prisma, Express, Socket.IO, or an ambient
network/database handle.

### Ownership contract

CozyVTT owns authoritative campaign data, membership/role checks, atomic domain
commands, visibility-filtered snapshots and events, idempotency/audit, live
fan-out, and the versioned SDK/gateway contracts. An extension owns only its
declared contribution and deterministic integration policy. An external agent
harness owns inference, prompts, goals, memory, timing, retries, multi-agent
coordination, and model-provider concerns.

These contexts all converge without moving the agent runtime into the VTT:

```mermaid
flowchart LR
  Harness[External agent harness] --> MCP[MCP /api/mcp]
  Human[Human browser] --> UI[REST + Socket.IO]
  Harness --> Tool[Installed extension tool]
  Tool --> Gateway[context.core gateway]
  MCP --> Host[Application/query hosts]
  UI --> Core[Core commands and queries]
  Gateway --> Host
  Host --> Core
  Core --> Truth[(Campaign state + event journal)]
  Core --> Live[Role-filtered live fan-out]
```

The plugin is optional composition logic, not the exclusive route to game
control. External agents can call core MCP tools directly, call a plugin tool
through MCP, or use the sibling JSON API. Trusted and sandboxed plugins reach
the same public core catalogue through their constrained gateways.

## Frontend contributions

The renderer host is per map canvas and supports controlled terrain, token,
and overlay registrations. Active **trusted local** packages may declare a
self-contained browser module. The backend rechecks the installed checksum and
serves only the declared module; `MapRendererProvider` imports it, exposes a
versioned, ownership-scoped layer API, and disposes its layers on refresh or
unmount. Sandboxed packages can never contribute executable browser code.

After authentication, `ThemeSyncBridge` fetches active contributions from
`GET /api/extensions/contributions`. Only complete data-only semantic palettes
are converted to a validated `ThemeHost` manifest; partial palettes and
arbitrary document-variable injection fail closed. Admin lifecycle actions
notify the browser to refresh that feed. Every validated active contribution is
listed in the ordinary user/admin theme picker and follows the same preference
storage and live-preview path as a built-in theme.

The admin extensions panel manages discovery, trusted/sandboxed installation,
lifecycle, and advanced non-user service grants. MCP users need none of those
grants. The panel deliberately presents trust/risk information and is
not a package registry or publishing workflow.

## Deliberate boundaries and remaining limits

- Core and extension runtimes remain separate on purpose. The explicit core
  gateway is the composition port between them; merging buses would weaken the
  isolation boundary and is not a migration objective.
- Packages remain operator-controlled files below `EXTENSION_PACKAGE_ROOT`.
  There is intentionally no remote store, publishing workflow, or marketplace.
  Upgrade/rollback and extension-owned data migrations are still absent.
- Trusted renderer modules can extend or replace named map layers, but there is
  no general React component/route injection, arbitrary CSS, or iframe plugin UI.
- MCP exposes the finite application query/command catalogues rather than a
  generic resource mirror. Initiative state is durable and revisioned, and the
  public snapshot/event queries reconstruct external-agent context after a
  restart. The durable event journal currently covers initiative transitions,
  not every campaign mutation. Persistent sandbox workers and richer
  resource/observability controls remain absent.

New work should extend explicit ports and versioned contracts, preserve the
separate core/extension boundary until it is intentionally unified, and add
transport, authorization, failure, and lifecycle tests with every capability.
