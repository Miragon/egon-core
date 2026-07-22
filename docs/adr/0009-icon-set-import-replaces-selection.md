# 0009 — Icon-set import replaces the selected icon set instead of merging

- Status: accepted
- Date: 2026-07-22

## Context

`loadConfiguration` merged an imported icon set additively into the selected
actor/workObject dictionaries: keys already present were kept, and icons from
earlier imports or `EgonClient.addIcon` calls were never cleared. The palette
therefore accumulated stale entries across imports, and what a story file
declared was not what the user saw after loading it. Upstream resolved the
same ambiguity in favor of replacement (wps/egon.io@f8fb1125, @889c0d71);
staying on merge semantics would make every future icon-handling port carry a
divergence.

## Decision

Importing an icon set replaces the current selection. `updateIconRegistries`
takes only the imported `IconSet` and hard-swaps the selected dictionaries
and icon-set name via `setIconSet`; custom icons are still registered in the
global icon dictionary and their CSS generated beforehand. The merge
machinery — `addIconsFromIconSetConfiguration`, `addIconsToTypeDictionary`,
`allInTypeDictionary` — is deleted rather than deprecated, mirroring
upstream.

## Alternatives considered

- **Keep merge semantics** — preserves icons across imports but means an
  imported story never faithfully represents its own icon set; rejected as
  the source of the stale-palette behavior.
- **Replace, but keep the now-unused public methods for compatibility** —
  `IconDictionaryService` is exported from `src/index.ts`, so this is the
  cautious option; rejected because a dead merge path invites reintroduction
  of the exact behavior this ADR removes.

## Consequences

- The palette after import equals the imported config — simpler to reason
  about, matches upstream.
- Icons previously added via `EgonClient.addIcon` that are absent from an
  imported config disappear from the selection (they remain in the global
  icon dictionary). Intended upstream behavior; hosts wanting them back
  re-add after import.
- Breaking API change: `updateIconRegistries(actors, workObjects, config)`
  became `updateIconRegistries(config)`, and three public methods are gone.
  Shipped in PR #22.
- `setIconSet` stores the config's `Dictionary` objects by reference; later
  register/unregister calls mutate them. Same as upstream, accepted.
