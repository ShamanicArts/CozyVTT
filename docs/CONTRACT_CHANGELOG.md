# Public contract changelog

This changelog is the human-readable evidence paired with tagged generated
artifacts in `contracts/public-capabilities.json`.

## Unreleased Phase 0 baseline

- Capability IDs: no removals or renames; command and query descriptors now
  publish explicit policy metadata.
- Schemas: no intentional breaking input/output changes.
- Approval protocol: adds `REJECTED` and `CANCELLED`, bounded display metadata,
  and execution-time approved-digest verification.
- Principal protocol: renames the delegated integration principal to
  `plugin`/`PLUGIN`; the accompanying migration preserves existing rows.
- Replay protocol: completed idempotent calls now return bounded retained public
  outcomes; failed calls retain only a stable public error envelope.

The three-release stability count starts only when this baseline is tagged as a
`contracts-v*` release. Unreleased work does not count.
