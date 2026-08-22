# Public contract changelog

This changelog is the human-readable evidence paired with tagged generated
artifacts in `contracts/public-capabilities.json`.

## contracts-v1.0.2

- Capability IDs: unchanged from `contracts-v1.0.1`.
- Schemas: unchanged from `contracts-v1.0.1`.
- Approval and principal protocols: unchanged from `contracts-v1.0.1`.
- Policy metadata: unchanged from `contracts-v1.0.1`.

## contracts-v1.0.1

- Capability IDs: unchanged from `contracts-v1.0.0`.
- Schemas: unchanged from `contracts-v1.0.0`.
- Approval and principal protocols: unchanged from `contracts-v1.0.0`.
- Policy metadata: unchanged from `contracts-v1.0.0`.

## contracts-v1.0.0 - Initial baseline

- Capability IDs: no removals or renames; command and query descriptors now
  publish explicit policy metadata.
- Schemas: no intentional breaking input/output changes.
- Approval protocol: adds `REJECTED` and `CANCELLED`, bounded display metadata,
  and execution-time approved-digest verification.
- Principal protocol: renames the delegated integration principal to
  `plugin`/`PLUGIN`; the accompanying migration preserves existing rows.
- Replay protocol: completed idempotent calls now return bounded retained public
  outcomes; failed calls retain only a stable public error envelope.

This baseline starts the rolling three-release stability window.
