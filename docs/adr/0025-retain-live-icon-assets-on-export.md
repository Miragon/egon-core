# 0025 — Retain live icon assets on export

- Status: accepted
- Date: 2026-09-08

## Context

EGN v4.0.0 stores one icon set alongside a story ([ADR 0007](0007-adopt-egn-v4-file-format.md)).
The client deliberately treats that set as the current creation selection, and
replacing it with `loadIcons` or removing an icon must immediately remove that
icon from `getIcons()` and `hasIcon()` ([ADR 0009](0009-icon-set-import-replaces-selection.md)).

Existing canvas elements still refer to their icon names after either operation.
The client retains their SVG sources in its instance-local icon pool for
rendering, but export previously serialized the selection alone. A saved file
could therefore contain actor or work-object types whose artwork was absent
when opened in a fresh client.

## Decision

For story export, serialize the union of the selected dictionaries and icon
names used by live actor/work-object elements, including nested groups. Missing
referenced names are resolved from the originating client's stored icon source
and added under their original category and name. The public selection-only
export remains the source for `getIcons()`, `hasIcon()`, and icon-change
payloads.

The v4 envelope and icon-set field remain unchanged. Retained assets become
part of the one stored icon set when a document is reopened, so they are then
available for creation as well as rendering.

## Alternatives considered

- **Delete or retag elements when their icons leave the selection** — rejected:
  selection management must not silently mutate a user's diagram.
- **Add a second, private retained-assets section to EGN** — rejected: it would
  require a format version, migrations, and cross-client support for data that
  existing v4 readers can already render from the icon set.

## Consequences

- Documents saved after icon removal or replacement remain self-contained for
  live elements, while unrelated historical assets stay out of the file.
- Export is a read-only operation: it does not restore selection entries,
  generate CSS, or emit icon-change events.
- Reopening can expose retained icons in the creation palette because EGN v4
  has no separate retained-assets vocabulary. This is an accepted consequence
  of preserving the established format and selection model.
