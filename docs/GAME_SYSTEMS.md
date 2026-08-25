# CozyVTT Game-System Extensions

CozyVTT game systems are independently versioned, trusted extension packages. A game-system package contributes authoritative character validation, starter templates, display metadata, and a bounded browser character sheet.

Core remains responsible for persistence, authentication, authorization, campaigns, membership, dice execution, initiative, synchronization, maps, fog, walls, lights, movement, visibility, and extension lifecycle policy.

## Stable IDs

The historical IDs remain valid and are never rewritten:

- `DND_5E`
- `PATHFINDER_2E`
- `SHADOWRUN_6E`
- `CALL_OF_CTHULHU_7E`

`null` remains the system-agnostic character format. New third-party systems use a namespaced lowercase ID such as `publisher.system-name`. IDs are persisted as bounded strings, not as a closed Prisma enum.

Shadowrun 6e remains registered for existing data but is not selectable for new characters until its sheet is complete.

## Compatibility Model

Core currently contains built-in definitions for the four historical systems. An active trusted extension may overlay a built-in definition with the same ID. Deactivation removes the extension-owned definition and immediately restores the built-in fallback.

This is the extraction seam:

1. Ship and validate the extension alongside the built-in adapter.
2. Activate it and compare validation, templates, and UI behavior.
3. Remove the built-in implementation only after the extension is the supported path.

Only one extension can own a system ID at a time. Registration is atomic: every JSON Schema and starter template must validate before any definition becomes visible.

## Package Descriptor

Declare the `game-systems` capability and add one or more entries to `contributions.gameSystems`:

```json
{
  "manifest": {
    "capabilities": ["game-systems"]
  },
  "contributions": {
    "gameSystems": [
      {
        "id": "publisher.system-name",
        "name": "System Name",
        "shortName": "System",
        "description": "Character rules and sheet support.",
        "contractVersion": "1",
        "selectable": true,
        "browserEntrypoint": "system.js",
        "characterDataSchema": {
          "type": "object",
          "required": ["characterName"],
          "properties": {
            "characterName": { "type": "string", "minLength": 1 }
          }
        },
        "characterTemplates": [
          {
            "id": "blank",
            "name": "Blank Character",
            "description": "A minimal new character.",
            "data": { "characterName": "New Character" }
          }
        ]
      }
    ]
  }
}
```

Descriptor limits are enforced during package review:

- `contractVersion` is currently `"1"`.
- Existing uppercase IDs and namespaced extension IDs are accepted.
- Browser entrypoints must remain inside the reviewed package.
- Character schemas and template objects are bounded to 64 KiB each.
- A package may declare at most 16 systems and 32 templates per system.
- System IDs and template IDs must be unique in their respective scopes.
- Every template must satisfy its system's JSON Schema.

Use `blank` for the default template. Keep required character fields minimal so players can save partial sheets while building a character.

## Authoritative Validation

Core compiles active extension schemas with Ajv and validates every character create or update before persistence. Plugins do not receive database access and do not execute backend validation code.

JSON Schema is therefore the portable rules-data boundary. Prefer standard draft-07-compatible keywords and test every shipped template against the exact generated schema. Unknown fields should remain accepted when compatibility with existing character JSON requires it.

Creature and NPC stat blocks remain a separate core-owned pipeline. A character game-system contribution does not automatically change creature editors, NPC rolls, token templates, or imported stat blocks.

## Browser Contract

The browser entrypoint is a self-contained JavaScript module exporting `activateGameSystem`:

```typescript
export function activateGameSystem(api: GameSystemPluginApi): () => void {
  return api.registerCharacterSheet({
    id: "publisher.system-name",
    mount(element, context) {
      // Render only inside element.
      return {
        update(nextContext) {
          // Apply host-owned character or mode changes.
        },
        dispose() {
          // Remove listeners and rendered content.
        }
      };
    }
  });
}
```

The bounded context contains:

- character ID, name, game-system ID, data, and optional token image URL;
- `view` or `edit` mode;
- `save(data, tokenImageUrl?)` through the host-owned character mutation path;
- `cancel()` to leave editing.
- optional `roll(expression, purpose)` through host-owned campaign dice execution.

The supported contract does not pass React internals, application stores, database handles, sockets, or unrestricted scene access. Browser modules are trusted reviewed code executing in the application realm, not a hostile-code sandbox. The returned disposer is lifecycle-owned and must remove all registrations.

## Reference Plugin

The independently versioned reference implementation is `cozyvtt-dnd5e` in the tabletop workspace. It preserves `DND_5E`, the existing Zod validation behavior, and the existing `blank` and `fighter` starter data.

Build and test it from its own repository:

```bash
cd repos/cozyvtt-dnd5e
npm install
npm test
```

The reviewed package is written to `package/`. Set `TRUSTED_EXTENSION_REVIEW_KEY` during the build to add an HMAC review signature. Install and activate it using the normal extension administration surface; while active, it owns `DND_5E`. Deactivation restores CozyVTT's built-in D&D adapter.

## Adding A System

1. Create an independently versioned plugin repository.
2. Add the trusted extension manifest and `game-systems` capability.
3. Define a stable ID, metadata, JSON Schema, and at least a `blank` template.
4. Build a self-contained browser entrypoint using the bounded contract.
5. Test schema/template parity and browser mount, update, save, and disposal.
6. Build the reviewed package and verify it parses through CozyVTT's host schema.
7. Install and activate it in a test deployment.
8. Verify campaign creation, character creation, validation, editing, deactivation fallback, and restart rehydration.

Do not add new Prisma enum members or backend switch branches. New systems become authoritative only while their reviewed extension is active.

## Legal And Content Boundaries

Game mechanics are generally not protected in the same way as expressive text, art, setting material, or trademarks. Keep plugin content to material you authored, material under a compatible license, or content you have permission to redistribute. Document the source and license of bundled rules data and assets.
