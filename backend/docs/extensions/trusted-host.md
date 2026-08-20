# Extension host operations and trust boundary

The extension host is a durable local-package control plane. It has an
administrator-facing HTTP API at `/api/admin/extensions`; it is not an
internet package installer or a general-purpose code-execution API.

## Package and trust requirements

Set `EXTENSION_PACKAGE_ROOT` to a controlled local directory containing
packages in this form:

```text
my-extension/
  cozyvtt.extension.json
  index.js
```

The package descriptor contains the extension manifest, a relative JavaScript
entrypoint, SHA-256 checksum for regular package files other than the package
descriptor, signature, and optional extension-id-to-semver-range dependencies.

Trusted in-process activation requires all of the following:

- real paths remain below `EXTENSION_PACKAGE_ROOT`; traversal and symlink
  escape are rejected;
- the host recomputes the package checksum;
- `TRUSTED_EXTENSION_ALLOWLIST` has an exact approved id/version/checksum; and
- signature verification succeeds.

The shipped verifier uses `TRUSTED_EXTENSION_REVIEW_KEY` as an HMAC review key.
Production deployments may substitute an asymmetric verifier. Missing or empty
trust configuration is deny-all. The admin endpoint receives a catalogue
package ID only; it never receives an arbitrary filesystem path or archive.

Trusted packages run in the CozyVTT server process, so approval is a code
review/security decision rather than an ordinary permission grant.

## Installation and lifecycle API

All `/api/admin/extensions` endpoints require authenticated platform-admin
access. The API can list available packages and persisted installations;
install as `trusted` or `sandboxed`; activate, deactivate, and uninstall; and
manage advanced grants for unattended service/system principals. Ordinary MCP
users authorize themselves with their existing campaign membership and do not
need these grants. The React admin screen is a client for the same control
plane.

An `ExtensionInstallation` persists package identity/digest, parsed manifest,
install mode, state, and safe lifecycle error information. Startup calls
rehydration before the HTTP listener opens, attempting to re-activate persisted
active packages. Failure is logged and the base VTT continues starting.

Rehydration is not a managed restart service: there is no persistent extension
worker, automatic child restart loop, upgrade/rollback workflow, or package
migration framework.

## Sandboxed packages

`mode: "sandboxed"` never imports a package into the server process. Each
operation launches a short-lived Node runner with versioned NDJSON input/output
under bubblewrap. Before launch the package checksum is rechecked.

The current Linux runtime requires bubblewrap and Node. It uses a read-only
`/package`, temporary writable work directory, disabled network namespace,
Node permission mode limited to package reads, and limits for concurrency,
timeout, heap, stdout, and stderr. A malformed protocol response, crash, or
timeout ends the child invocation without crashing the server.

This is a useful process boundary, not a complete multi-tenant sandbox. There
is currently no cgroup CPU quota, persistent worker, arbitrary network access,
per-extension persistent storage, user-configurable capability grant, or
detailed runtime telemetry.

The supplied Docker images use Node 24 LTS and install bubblewrap. Docker's
default seccomp profile blocks the user namespace that bubblewrap needs, so the
provided Compose services opt into `seccomp=unconfined` while retaining
`no-new-privileges` and the unprivileged `appuser`. That is a deliberate
deployment tradeoff: it permits the backend to create a _more restricted_ child
namespace, but broadens the backend container's syscall policy. Operators that
cannot accept that tradeoff must leave `EXTENSION_PACKAGE_ROOT` empty, or deploy
the extension runner as a separately hardened service with an equivalent user
namespace policy. The package catalogue mount is read-only at
`/app/extensions`; package installation records live in PostgreSQL.

## Agent and contribution boundaries

MCP clients connect to `/api/mcp`, complete standard OAuth discovery/PKCE, and
receive access only after the signed-in user chooses a campaign and clicks
Allow. Credentials are hash-only at rest and handled by the client. No manual
bearer or extension-grant ceremony is required. The delegated human must remain
a campaign member; existing campaign roles govern commands. Writes use
idempotency, and a sensitive command may wait on a one-click confirmation ID.

The built-in core-agent path uses the production application host and its
transactional durable audit/idempotency/outbox middleware. Active sandbox tools
use the extension bridge's separate registry/command bus; do not assume the
same core-host transaction/outbox coverage for that path.

Authenticated clients may fetch active data-only theme contributions from
`/api/extensions/contributions`. ThemeHost validates complete semantic palettes
before registration, and validated themes appear in the standard theme picker.
Active trusted packages may also declare a self-contained browser renderer
entrypoint. The server rechecks the installed package checksum and serves only
that declared JavaScript file; the browser gives it a versioned, scoped API for
registering or replacing map-canvas layers. Sandboxed installations cannot
serve renderer code. This does not permit arbitrary CSS, React route/component
injection, or undeclared frontend files.

The MCP endpoint at `/api/mcp` is another adapter over the existing delegated
identity, query/command, confirmation, idempotency, and audit boundaries. It
does not expose arbitrary HTTP, database,
shell, or Socket.IO access. Packages remain local operator-controlled files;
there is intentionally no public package marketplace or remote package store.
