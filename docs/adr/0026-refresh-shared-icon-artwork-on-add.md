# 0026 — Refresh shared icon artwork on add

- Status: accepted
- Date: 2026-09-11

## Context

Icon dictionaries are deliberately first-write-wins, but `addIcon()` used their
ordinary insertion methods for both the historical artwork pool and the selected
category. Adding an existing name, including removing and re-adding it, therefore
kept the first source. Existing shapes, palette CSS, public queries and export
could disagree about which artwork the caller had most recently supplied.

Actor and work-object shapes resolve artwork from one name-keyed pool. The public
API and EGN v4 format have no category-qualified asset identity, and import has
separate actor-first collision semantics that must remain stable.

## Decision

`addIcon()` is a replace-by-name operation. It validates and sanitizes the input
before mutation, then explicitly replaces the historical pool entry and the
requested category's selected entry. If the other category already selects the
same name, its source is refreshed too; adding an icon does not create membership
in that other category.

After storing the sanitized source, the active editor session publishes its CSS
and synchronously fires diagram-js `elements.changed` for every live actor or
work-object shape whose icon id exactly matches the name. This repaint is a read
of unchanged business objects and creates no command-stack entry. Configuration
change notification remains last. Icon import keeps ADR 0009's replacement and
actor-first collision behavior.

## Alternatives considered

- **Require removal before replacement** — rejected because removal changes only
  selection and deliberately retains live artwork; it cannot express a reliable
  asset update with a first-write-wins pool.
- **Qualify artwork by category** — rejected because it changes the established
  name-based renderer, public query semantics and EGN v4 representation.
- **Repaint through an undoable model command** — rejected because artwork
  replacement does not mutate the diagram model; an undo entry would imply a
  business-object change that did not occur.

## Consequences

- Existing and newly created matching shapes use the latest sanitized artwork
  immediately, without reload/import and without changing undo history.
- A selected shared name cannot display different actor and work-object artwork;
  updating either category refreshes both. Category membership itself stays
  independent.
- Removed artwork remains available for live shapes under ADR 0025, and re-adding
  that name now refreshes the retained pool.
- Generic `Dictionary` insertion, icon-set import, sanitization, and the EGN
  format remain unchanged.
