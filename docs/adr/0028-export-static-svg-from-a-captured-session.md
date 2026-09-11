# 0028 — Export static SVG from a captured editor session

- Status: accepted
- Date: 2026-09-11

## Context

Hosts need a complete visual export without depending on diagram-js internals or
moving the live story to positive coordinates. The live canvas may be zoomed,
selected, replaying, or showing a passive color preview, and document export
previously wrote annotation dimensions into live business objects.

## Decision

`EgonClient.exportSVG` captures the current EGN document, materializes that
snapshot in an isolated hidden editor session, and clones the captured session's
rendered root layer and definitions. Bounds come from rendered content, not the
viewport. Editor and replay markers are removed; optional title, description,
background, and padding are added to the detached SVG.

Embedded documents use WPS's hidden-text `%3CDST%3E…%3C/DST%3E` envelope by
default. JSON characters that XML or WPS's legacy decoder could reinterpret are
written as JSON unicode escapes. Document serialization projects annotation
geometry into copies and performs no live model writes.

## Alternatives considered

- **Clone the live SVG directly** — rejected because transient preview and
  replay presentation would leak into the output.
- **Call `alignToOrigin` before export** — rejected because a read operation
  must not add history or dirty the document.

## Consequences

- Export is independent of viewport and transient UI, and negative coordinates
  remain valid.
- A visual export temporarily constructs a second editor session, accepting the
  same peak-memory trade-off as staged imports (ADR 0024).
- Animated SVG and SVG import remain outside the core API.
