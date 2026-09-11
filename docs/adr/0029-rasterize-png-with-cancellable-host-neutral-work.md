# 0029 — Rasterize PNG with cancellable, host-neutral work

- Status: accepted
- Date: 2026-09-11

## Context

PNG export needs browser image decoding and canvas encoding, both asynchronous.
Edits during that work must not combine revisions, and obsolete work must end
when a host cancels, a document replacement succeeds, or a client is destroyed.
`AbortSignal` is convenient for hosts but is not the modeler port's domain
contract.

## Decision

`EgonClient.exportPNG` adapts an optional `AbortSignal` to a framework-free
cancellation interface. The modeler adapter synchronously captures the same
clean SVG representation as ADR 0028, without embedded EGN, then rasterizes it
through `HTMLImageElement` and canvas at a positive finite scale. SVG defaults
to a white background for PNG.

Each pending export has an instance-owned cancellation source. Successful
session promotion and destruction cancel it; failed import does not. Every
cancellation rejects with an error named `AbortError`, and all temporary DOM,
image handlers, canvases, object URLs, and captured sessions are released.

## Alternatives considered

- **Return a Blob** — rejected because bytes are host-neutral and let webviews,
  file APIs, and non-browser persistence choose their own container.
- **Rasterize the live DOM after awaiting decode** — rejected because it could
  mix document revisions.

## Consequences

- Hosts can use ordinary abort controllers without leaking them through the
  modeler port.
- Canvas taint, decoding, measurement, and encoding failures reject normally.
- Playback timers, progress UI, and downloads remain host-owned.
