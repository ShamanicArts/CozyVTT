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

* real paths remain below `EXTENSION_PACKAGE_ROOT`; traversal and symlink
  escape are rejected;
* the host recomputes the package checksum;
* `TRUSTED_EXTENSION_ALLOWLIST` has an exact approved id/version/checksum; and
* signature verification succeeds.

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
list, create, and revoke durable scoped grants. The React admin screen is a
client for the same control plane.

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
deployment tradeoff: it permits the backend to create a *more restricted* child
namespace, but broadens the backend container's syscall policy. Operators that
cannot accept that tradeoff must leave `EXTENSION_PACKAGE_ROOT` empty, or deploy
the extension runner as a separately hardened service with an equivalent user
namespace policy. The package catalogue mount is read-only at
`/app/extensions`; package installation records live in PostgreSQL.

## Agent and contribution boundaries

`/api/agent` uses campaign-scoped bearer credentials. Only a SHA-256 credential
hash is persisted; plaintext appears only once when issued. The credential's
delegated human must still be a campaign member. Exact durable grants control
agent use, and write operations require idempotency plus a one-time,
human-approved receipt bound to the scoped command and canonical input digest.

The built-in core-agent path uses the production application host and its
transactional durable audit/idempotency/outbox middleware. Active sandbox tools
use the extension bridge's separate registry/command bus; do not assume the
same core-host transaction/outbox coverage for that path.

Authenticated clients may fetch active data-only theme contributions from
`/api/extensions/contributions`. ThemeHost validates complete semantic palettes
before registration. This does not permit arbitrary CSS, frontend bundle
loading, or renderer replacement; renderer extensions remain controlled
in-process canvas registrations.

There is no MCP server, public package marketplace, or arbitrary agent HTTP,
database, shell, or Socket.IO access in the current host.
