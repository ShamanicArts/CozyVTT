# Extension architecture

## Scope

CozyVTT provides a controlled local-extension runtime, public campaign
capabilities, OAuth-authorized HTTP transports, durable approvals/audit, and
renderer/theme contributions. Packages remain operator-controlled files; a
remote package store, marketplace, and unreviewed acquisition are non-goals.

Canonical contracts live in `backend/src/extensions/` and the distributable
surface lives in `packages/extension-sdk`. Express, Socket.IO, Prisma, SQL, DOM,
and React internals do not belong in those contracts.

## Runtime

```mermaid
flowchart LR
  Admin[Platform administrator] --> AdminApi[/api/admin/extensions]
  AdminApi --> Host[ExtensionHostService]
  Host --> Store[(ExtensionInstallation)]
  Host --> Trusted[TrustedRegistryProxy]
  Host --> Sandbox[SandboxedExtensionSupervisor]
  Sandbox --> Child[bwrap + Node child]
  Trusted --> Registry[ExtensionRegistry]
  Sandbox --> Registry
  Registry --> Bridge[ExtensionCommandBridge]

  Client[Plugin client] --> OAuth[OAuth + PKCE]
  OAuth --> Transport[/api/plugin-transports/:extensionId]
  Transport --> Handler[Extension HTTP handler]
  Handler --> Gateway[Scoped core gateway]
  Gateway --> Hosts[Application and query hosts]
  Hosts --> Durable[(membership / approvals / audit / idempotency / outbox)]
```

An OAuth-protected extension route receives authorization metadata and a
campaign-scoped `context.capabilities` gateway. The handler can discover and
dispatch versioned `vtt.*` commands and finite public queries. It receives no
database, shell, internal HTTP, or raw Socket.IO access. There is no parallel
core execution route.

## Manifest

`ExtensionManifest` version `1.0` declares identity, compatibility,
contribution categories, permissions, commands, published capabilities, HTTP
routes, and OAuth resources. `capability-publications` exposes command-backed
descriptors through the extension bridge. Their permissions must cover the
bound command permissions, and high-risk publications must require approval.

A declaration is not authorization. OAuth resources bind a route to an exact
extension/resource pair and finite scopes. Delegated plugin credentials are
hash-only, campaign-scoped, and valid only while the user remains a member.

## Approvals And Audit

Sensitive commands can create a `CapabilityApproval` bound to the credential,
user, campaign, extension, command, and canonical input digest. Only the
delegated user's authenticated browser session can approve or deny it. An
approval is atomically consumed once.

Protected execution records value-free allow, deny, execute, and failure audit
entries. Idempotent writes retain bounded public outcomes and publish through
the transactional outbox.

## Trust

Trusted packages run in the server process and therefore require exact
id/version/checksum allowlisting plus signature verification. Sandboxed
packages run as short-lived Node children under bubblewrap with read-only
package access, no network namespace, bounded resources, and versioned NDJSON.
Sandboxed handlers may return only bounded declarative core actions, which the
host validates and dispatches after the child exits.

## Frontend Contributions

Active trusted packages may publish a declared browser renderer module. The
backend rechecks its package checksum and serves only that file. The browser
provides an ownership-scoped layer API and disposes registrations on refresh or
unmount. Theme contributions are data-only complete semantic palettes. Neither
surface permits arbitrary route, component, CSS, or document mutation.

Core and extension command runtimes remain separate. The scoped gateway is the
intentional composition boundary; new work should extend explicit ports and
versioned contracts rather than bypass it.
