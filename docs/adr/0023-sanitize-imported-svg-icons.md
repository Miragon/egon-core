# 0023 — Sanitize imported SVG icons at storage and rendering boundaries

- Status: accepted
- Date: 2026-09-08

## Context

Icon sources enter egon-core through story import, `loadIcons()` and
`addIcon()`. They were retained verbatim, published into a CSS data URL and,
for actor/work-object rendering, parsed by tiny-svg and appended to the live
canvas. An imported SVG could therefore bring scripts, event handlers,
`foreignObject` HTML or executable/external references into the document. The
renderer also recoloured SVG and built image wrappers with string interpolation,
so sanitizing only on import would not protect transformed markup or a legacy
registration path that bypassed import.

The file format and public `EgonClient` signatures must remain stable. Static
artwork, existing icon names and safe data-image icons must continue to work.
Rendering remains read-only under ADR 0016, and ADR 0008's rule that icon names
are stored verbatim remains unchanged; this decision concerns icon **content**.

## Decision

Use DOMPurify 3.4.15 as a pinned runtime dependency behind an internal
`IconSanitizerPort`. Its infrastructure adapter is instantiated by each
diagram-js injector, so sanitizer configuration and state are isolated per
client. The icon service sanitizes and copies every actor/work-object dictionary
before registry replacement, registration, custom-pool retention or CSS
publication. Consequently `getIcons()` and story export return the normalized,
safe source rather than the caller's input.

The supported SVG subset is static presentation: shapes, paths, groups,
transforms, text, gradients, clipping, masks, filters and validated local
fragment references. Scripts, event attributes, `foreignObject` and its
contents, animation, embedded stylesheets and executable/external URLs are
removed. Inline `style` declarations are reparsed through the browser CSSOM and
reconstructed from an explicit SVG-presentation-property allowlist; URL values
must be local fragments. DOMPurify remains the markup sanitizer, not the CSS
policy.

SVG data URLs are decoded, run through the same policy and re-encoded. Base64
PNG, JPEG, GIF and WebP data URLs are retained only when decoding succeeds and
their byte signature matches the declared type. Other or malformed data URLs
are not retained. If parsing fails or sanitization removes all drawable artwork,
the icon name remains registered but its value becomes a known empty 24×24 SVG.
The unsafe original is never used as a fallback.

Actor and work-object drawing share one icon creation path. Recolouring and
data-URL wrapping use DOM attribute operations. The sanitizer then applies the
full policy again to the transformed SVG immediately before tiny-svg creates and
appends the live element. This last pass covers transformation defects and
registration bypasses without writing repaired or recoloured values back into
story business objects.

## Alternatives considered

- **Rely on CSP** — a host may not deploy a restrictive policy, and library
  safety cannot depend on document-wide configuration outside egon-core's
  control.
- **Use DOMPurify only immediately before rendering** — prevents execution in
  the canvas but leaves unsafe content in memory, CSS publication and exported
  files, allowing it to return on another consumer or save/open cycle.
- **Use DOMPurify only when storing** — post-sanitization recolouring/wrapping
  and legacy registry bypasses would sit beyond the safety boundary.
- **Reject the whole story/icon set** — safer by simplicity but unnecessarily
  loses usable static artwork and conflicts with import's existing repair-and-
  continue behavior.

## Consequences

- Import, `loadIcons()` and `addIcon()` keep working without a confirmation or a
  new public repair event; unsafe portions are silently neutralized.
- Exported icon markup may be normalized, reordered or re-encoded, and unsafe or
  unsupported features disappear. Repeated sanitization is idempotent, so
  save/open cycles converge instead of progressively changing the source.
- Active SVG features, animation, unrestricted CSS, external resources and
  non-image data URLs are no longer compatible. Static geometry and supported
  presentation features remain compatible.
- Icons whose artwork is malformed or entirely unsupported render as an empty
  inert icon under their original name rather than throwing in the renderer.
- DOMPurify becomes part of the browser runtime and must receive security
  updates deliberately; pinning makes such changes reviewable rather than
  silently changing the accepted subset.
- Unit policy tests and Chromium regressions through real `EgonClient` instances
  enforce storage, CSS, export/re-import and final-render behavior for both actor
  and work-object icons.
