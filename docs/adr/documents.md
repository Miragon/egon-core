# Story documents

The EGN file format and how documents are imported and exported, including
visual exports.

## <a id="doc-1"></a>DOC-1 — Read every historical EGN shape; write only v4.0.0

- Status: accepted
- History: 2026-07-22 decided (ADR 0007)

**Context.** Upstream Egon.io changed its export format several times:

- The oldest files are a bare element array.
- v1.x wrote `{ domain, dst }` with both values as JSON strings.
- Up to 3.0.0, files wrote objects and smuggled story metadata in as
  `{info}`/`{version}` trailer entries.
- v4.0.0 writes `{ iconSet, domainStory }` with `title`, `description`,
  `scope`, and `version` as first-class fields.

The library's job is to open anything the Egon.io ecosystem has produced.
That needs a deliberate compatibility policy, not piecemeal fixes.

**Decision.**

- Import normalizes every known shape through one `ExportFileParser`, ported
  from upstream. A payload it does not recognize throws instead of producing
  an empty story.
- Export always writes the v4.0.0 envelope: `businessObjects` sorted by id for
  stable diffs, metadata on `domainStory`, and no legacy trailer.
- The public `DomainStoryDocument` type matches the v4 file shape exactly, so
  hosts round-trip files with plain `JSON.parse` and `JSON.stringify`.
- Story-level metadata lives in a session-scoped
  `DomainStoryPropertiesService`, because the element registry cannot hold
  story fields.

**Rejected alternatives.**

- **Write back the format that was read:** this keeps every legacy format
  alive on the write path. Current Egon.io also converts files on save.
- **A public document model decoupled from the file format:** this adds a
  mapping layer with no benefit to consumers. Revisit it before 1.0 if the API
  must outlive the file format.

**Consequences.**

- Opening and saving an old file migrates it to v4.0.0. Old files are
  upgraded, not preserved. This is accepted.
- The public API is coupled to the file shape, so a v5 format would be a
  breaking API change. This is accepted before 1.0.
- The fixtures in `src/__tests__/fixtures/` (v1.0.0–2.2.0 and 4.0.0) are the
  executable compatibility contract. Supporting a new version means adding a
  fixture and a parser branch.
- New editor guarantees are expressed inside v4 rather than with fields that
  existing v4 readers would not understand. Icon order ([ICO-3](icons.md#ico-3))
  and retained assets ([ICO-4](icons.md#ico-4)) work this way.

## <a id="doc-2"></a>DOC-2 — Imports are validated, repaired, reported and atomic

- Status: accepted
- History: 2026-07-22 parse before clearing (ADR 0007); 2026-07-28 repairs
  reported through `import.repaired` (ADR 0017); 2026-09-08 staged in an
  isolated session (ADR 0024)

**Context.** Imported files are untrusted and sometimes damaged. Activity
edges can point at missing elements, which would hand diagram-js connections
with `undefined` ends. Icon SVG can contain scripts. Rejecting a damaged file
loses usable work. Repairing it silently makes the loss permanent on the next
save.

**Decision.**

- Normalize, validate, and repair the data before touching the active editor.
  Pass diagram-js explicit, validated attributes, not a spread of the imported
  record.
- Repair and continue instead of rejecting:
    - drop unreferenced connections (`pruneUnreferencedConnections`)
    - sanitize icon content ([ICO-2](icons.md#ico-2))
    - fill in missing activity numbers, once
- Report lossy repairs through the public `import.repaired` event, with
  `{ removedConnectionIds }`. The payload holds ids, not internal objects, and
  arrives before `import()` returns ([API-2](public-api.md#api-2)). The
  internal `dst.import.repaired` bus event remains its source.
- Build the imported story in a candidate session and promote it only when
  every step succeeds ([ARC-6](architecture.md#arc-6)). A successful import
  keeps the viewport and starts with empty undo/redo history. A second import
  started while one is running is rejected. `import()` stays synchronous.

**Rejected alternatives.**

- **Drop the repair signal as dead wiring:** this deletes the only evidence
  that an import lost data.
- **Document `additionalModules` plus the internal event as the way to observe
  repairs:** this makes internal names a contract with no compiler support.
- **Return the repair from `import()`:** this changes the signature, a breaking
  change, for data that is empty in the common case.

**Consequences.**

- A host that subscribes to `import.repaired` can warn the user before they
  save over the original. A host that does not subscribe is no worse off than
  before.
- `ImportRepairData` is part of the compatibility surface. Adding fields (for
  example dropped shapes or reason codes) is safe. Renaming
  `removedConnectionIds` is a breaking change.
- Sanitization repairs are silent by design ([ICO-2](icons.md#ico-2)). Only
  structural data loss is reported.

## <a id="doc-3"></a>DOC-3 — Exports are read-only projections; visual exports render a captured session

- Status: accepted
- History: 2026-07-22 v4 export (ADR 0007); 2026-07-23 no automatic
  alignment (ADR 0011); 2026-09-08 live icon assets retained (ADR 0025);
  2026-09-11 SVG export (ADR 0030) and PNG export (ADR 0031)

**Context.** Hosts save on `story.changed`. An export that writes to the
model, aligns it, or marks it dirty therefore causes a loop. A visual export
must not depend on the current zoom, selection, replay, or color preview, and
must work with negative coordinates.

**Decision.**

- `export()` builds a new v4 document from the live session. It copies
  geometry such as annotation size and never writes it back. It includes the
  icon assets used by live elements, even after they left the selection
  ([ICO-4](icons.md#ico-4)). It creates no history, CSS, or events.
- `exportSVG()` captures the current EGN document, rebuilds it in an isolated
  hidden session ([ARC-6](architecture.md#arc-6)), and clones that session's
  rendered root layer and definitions. Bounds come from the rendered content,
  not the viewport. Editor and replay markers are removed. An optional title,
  description, background, and padding are added to the detached SVG.
- By default the SVG embeds the document in WPS egon.io's hidden-text
  `%3CDST%3E…%3C/DST%3E` envelope. JSON characters that XML or WPS's legacy
  decoder could misread are written as JSON unicode escapes.
- `exportPNG()` first captures the same clean SVG, without the embedded
  document, in one synchronous step. It then rasterizes it through
  `HTMLImageElement` and a canvas at a positive, finite scale, on a white
  background by default, and returns bytes. A pending export is cancelled by
  the host's `AbortSignal`, by a successful import, or by `destroy()`. A
  cancelled export rejects with `AbortError` and releases every temporary
  resource. A failed import does not cancel it.

**Rejected alternatives.**

- **Align automatically inside `export()`:** `align()` fires `story.changed`
  and would retrigger the host's save loop.
- **Clone the live SVG:** temporary preview and replay state would leak into
  the output.
- **Rasterize the live DOM after awaiting image decoding:** the output could
  mix two document revisions.
- **Return a `Blob`:** returning bytes lets webviews and file APIs choose their
  own container.

**Consequences.**

- Visual exports do not depend on the viewport or temporary UI, and negative
  coordinates remain valid.
- Each visual export briefly builds a second session, with the same memory
  trade-off as staged imports ([ARC-6](architecture.md#arc-6)).
- Animated SVG and SVG import stay outside the core API. Downloads and
  progress UI belong to the host.
