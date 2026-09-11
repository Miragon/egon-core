# 0031 — Expose retained icon configuration and explicit order

- Status: accepted
- Date: 2026-09-11

## Context

The existing icon API covers selection replacement, addition, removal, lookup,
and naming, but a host cannot inspect retained artwork, usage, or reliable
palette order. Adding parallel draft/configuration APIs would duplicate state
already owned by the ordered dictionaries.

## Decision

`getIconConfiguration` returns a detached snapshot containing the set name,
the full retained name-to-artwork catalog, ordered actor/work-object selections,
and distinct names used by live elements. `setIconOrder` accepts one category
and an exact permutation of its selected names. It validates duplicates,
missing names, and extras before rebuilding that category's ordered dictionary.

Only effective reorderings fire the existing `icons.changed` event. Existing
sanitization, retained-asset behavior, shared-name artwork, and EGN v4 storage
remain unchanged.

## Alternatives considered

- **Add facade methods for every configuration-screen action** — rejected;
  `loadIcons`, `addIcon`, and `removeIcon` already compose those operations.
- **Persist an explicit order array in EGN** — rejected because it would require
  a format migration for an editor-session guarantee.

## Consequences

- Hosts can implement reorderable palettes without importing internal services.
- Ordering follows JavaScript object/dictionary order within a session. EGN's
  object-key representation still reorders integer-like names on round trip.
- Built-in catalogs, filtering, drafts, reset, and cancellation remain host
  concerns.
