# Campaign Presentations Checkpoint

## Completed

- Added a trusted extension contribution contract for campaign presentations.
- Added campaign-scoped presentation selection, persistence, authorization, and contribution routes.
- Added a bounded frontend presentation registry, renderer host, toolbar contribution surface, and scene projection.
- Preserved the built-in 2D map while allowing campaigns to switch to an installed presentation.
- Verified affected backend tests, backend build, frontend tests, typecheck, lint and build, and extension SDK conformance.
- Released and activated the separately versioned Three.js map presentation plugin.

## Remaining

- Extract game-system-specific behavior behind a public extension contract, starting with a compatibility adapter before moving D&D 5e out of core.
- Add a bounded semantic material resolver before implementing Three.js material plugins.
