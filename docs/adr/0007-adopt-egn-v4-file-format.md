# 0007 — Adopt EGN v4.0.0 as the canonical file format

- Status: accepted
- Date: 2026-07-22

## Context

Upstream Egon.io changed its on-disk export format over the years: the oldest
exports are a bare element array; v1.x wrote `{ domain, dst }` with both values
as JSON _strings_; ≤3.0.0 wrote them as objects, with story metadata smuggled in
as `{info}`/`{version}` trailer entries appended to the `dst` array; v4.0.0
writes `{ iconSet, domainStory }` with `title`, `description`, `scope`, and
`version` as first-class fields.

The extracted core (ADR [0002](0002-standalone-core-extracted-from-egon-io.md))
only understood the ≤3.0.0 object shape: v4.0.0 files failed to import, v1.x
JSON-string payloads crashed the importer, and story metadata was dropped on
save. A library whose job is to open anything the Egon.io ecosystem has ever
produced needs a deliberate compatibility policy, not piecemeal fixes.

## Decision

**Read every historical shape; write only v4.0.0.**

- Import normalizes all known shapes through one `ExportFileParser` (ported
  from upstream Egon.io's `exportToDomainStory`/`extractIconSet`): v4.0.0,
  legacy `{ domain, dst }` including the v1.x JSON-string variants, and the
  bare element array. An unrecognized payload throws instead of yielding an
  empty story — the importer clears the canvas only after a successful parse,
  so a wrong file cannot wipe the user's current diagram.
- Export always emits the v4.0.0 envelope (`EgnExportFile`): id-sorted
  `businessObjects` for stable diffs, metadata on the `domainStory` object, no
  legacy `{info}`/`{version}` trailer.
- Story-level metadata round-trips through a session-scoped
  `DomainStoryPropertiesService`, because the diagram-js element registry
  cannot hold fields that belong to the story rather than an element.
- The public `DomainStoryDocument` mirrors the on-disk v4 shape exactly, so
  hosts round-trip files with plain `JSON.parse`/`JSON.stringify` and no field
  mapping. This was a breaking API change, accepted while the package is
  pre-release (v0.0.1).

## Alternatives considered

- **Write back the format that was read** — rejected: it keeps every legacy
  format alive indefinitely on the write path; converging on save matches what
  current Egon.io itself does.
- **A public document model decoupled from the file format** — rejected for
  now: it adds a mapping layer with no consumer benefit while the library's
  purpose is precisely to read/write the Egon.io file. Revisitable before 1.0
  if the API needs to outlive the wire format.

## Consequences

- Any historical `.egn`/`.dst` file imports, but an open→save cycle silently
  migrates it to v4.0.0 — old files are upgraded, not preserved. Known and
  accepted.
- The public API is coupled to the on-disk shape: a future v5 format becomes a
  breaking API change, not just a parser change. Accepted while pre-1.0.
- The fixture suite (`src/__tests__/fixtures/`, v1.0.0–2.2.0
  and 4.0.0) is the executable compatibility contract; supporting a new
  upstream version means adding a fixture and a parser branch.
- Exported files always declare `version: "4.0.0"` regardless of the version
  they were imported from.
