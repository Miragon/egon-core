# Icons

How icon names, icon content, the selected icon set, and icon artwork are
handled.

## <a id="ico-1"></a>ICO-1 — Icon names are verbatim data; sanitize only for CSS

- Status: accepted
- History: 2026-07-22 decided (ADR 0008)

**Context.** Custom icon names containing `.` or other CSS-special characters
broke, here and upstream. `sanitizeIconName` treated everything
after the last dot as a file extension, so the stored name changed. Exports
then lost the original name, and re-imported stories no longer matched their
canvas business objects. The leftover dot also produced invalid CSS selectors.
Sanitization was spread over three layers, and each one changed the name in a
different way.

**Decision.** Icon names stay verbatim wherever they are stored or exchanged:
dictionary keys, export files, and the `addIcon` API.

- Names are sanitized exactly once, at the CSS boundary, by `sanitizeForCss`
  (ported from upstream). It replaces every character outside
  `[a-zA-Z0-9_-]` with `_`, prefixes a leading digit with `_`, and lowercases
  the result.
- Rule generation and class lookup call the same function on the same key, so
  they always agree.
- Filename handling (upstream's `sanitizeIconName`) is a host concern and is
  not part of the core.
- The fork's `mask-image` icon CSS is kept in preference to upstream's
  `content: url(...)`. Only the class naming changed.

**Rejected alternatives.**

- **Strip dots everywhere:** this still loses information. Sanitizing storage
  keys is the root cause, not the fix.
- **Escape selectors with `CSS.escape`:** the classes are valid but
  unreadable, and they diverge from upstream's class names
  ([FND-3](foundations.md#fnd-3)).

**Consequences.**

- Export and re-import preserve names exactly, and icons with dots in their
  names render.
- Distinct names can map to the same class (`My.Icon` and `my_icon`), in which
  case the last inserted rule wins. This matches upstream and is accepted.
- Import repair rewrites legacy names only in one case: it maps a historical
  space-separated reference to its hyphenated form when the exact name does
  not exist and the hyphenated icon does.

## <a id="ico-2"></a>ICO-2 — Sanitize icon content at storage and again before rendering

- Status: accepted
- History: 2026-09-08 decided (ADR 0023)

**Context.** Icons enter through story import, `loadIcons()`, and `addIcon()`.
They were kept verbatim and published in CSS data URLs. For actors and work
objects they were also parsed and appended to the live canvas. An SVG could
therefore bring scripts, event handlers, `foreignObject` HTML, or external
references into the host document.

The renderer also recolors and wraps markup, so sanitizing only on input would
miss transformed markup and registration paths that bypass import. A Content
Security Policy cannot be relied on, because hosts may not deploy one.

**Decision.**

- Pinned DOMPurify sits behind an internal `IconSanitizerPort`. Its adapter is
  instantiated per injector.
- Every actor and work-object dictionary is sanitized and copied before it
  replaces the registry, is registered, is kept in the artwork pool, or is
  published to CSS. `getIcons()` and export return the sanitized source.
- Only static presentation is supported: shapes, paths, groups, transforms,
  text, gradients, clipping, masks, filters, and validated local fragment
  references.
- Scripts, event attributes, `foreignObject`, animation, embedded stylesheets,
  and executable or external URLs are removed.
- Inline `style` attributes are reparsed through the browser's CSSOM and
  rebuilt from an allowlist of SVG presentation properties. URLs must be local
  fragments.
- SVG data URLs are decoded, sanitized, and re-encoded. Base64 PNG, JPEG, GIF,
  and WebP data URLs are kept only if they decode successfully and their byte
  signature matches the declared type.
- If nothing drawable survives, the name stays registered with an empty
  24×24 SVG. The unsafe original is never used as a fallback.
- Recoloring and data-URL wrapping use DOM attribute operations. The full
  policy runs again on the transformed SVG immediately before tiny-svg appends
  it. Nothing is written back to business objects
  ([ARC-4](architecture.md#arc-4)).

**Rejected alternatives.**

- **Rely on a Content Security Policy:** the library's safety cannot depend on
  document-wide configuration outside its control.
- **Sanitize only before rendering:** unsafe content would stay in memory, in
  CSS, and in exported files.
- **Sanitize only when storing:** recoloring, wrapping, and registry bypasses
  would sit outside the safety boundary.
- **Reject the whole story or icon set:** this loses usable artwork and
  conflicts with repair-and-continue imports
  ([DOC-2](documents.md#doc-2)).

**Consequences.**

- Import, `loadIcons()`, and `addIcon()` keep working without confirmation.
  Unsafe parts are removed silently.
- Exported markup may be normalized, reordered, or re-encoded. Sanitization is
  idempotent, so repeated save/open cycles converge.
- Active SVG features, animation, unrestricted CSS, external resources, and
  non-image data URLs are no longer supported.
- DOMPurify is part of the browser runtime. Upgrading it is a deliberate,
  reviewed change, because an upgrade can change which SVG content is
  accepted.

## <a id="ico-3"></a>ICO-3 — The icon selection is replaced on import and ordered explicitly

- Status: accepted
- History: 2026-07-22 import replaces the selection (ADR 0009); 2026-09-11
  configuration snapshot and explicit order (ADR 0033)

**Context.** `loadConfiguration` merged an imported icon set into the current
selection. The palette collected stale entries and did not match what the
file declared. Upstream chose replacement (wps/egon.io@f8fb1125, @889c0d71).
Hosts also need a reliable palette order, and a way to inspect the icon
configuration without separate draft APIs.

**Decision.**

- Importing an icon set, whether through a document import or `loadIcons()`,
  replaces the selected actor and work-object dictionaries and the set name.
  Custom artwork is still registered in the artwork pool
  ([ICO-4](#ico-4)). The old merge code is deleted, not deprecated.
- When an imported actor and work object share a name, the actor wins.
- `getIconConfiguration()` returns a detached snapshot with:
    - the set name
    - the catalog of retained artwork
    - the ordered selections
    - the icon names used by live elements
- `setIconOrder(category, names)` takes an exact permutation of that category's
  selection. Duplicates, missing names, and extra names are rejected before
  anything changes. The call rebuilds the ordered dictionary, and
  `icons.changed` fires only if the order actually changed.

**Rejected alternatives.**

- **Keep merge semantics:** an imported story would never show exactly its own
  icon set.
- **Keep the unused merge methods public for compatibility:** a dead merge
  path invites the old behavior back.
- **Store an explicit order array in EGN:** this needs a format migration for
  something only an editor session needs ([DOC-1](documents.md#doc-1)).
- **Add facade methods for every configuration-screen action:** `loadIcons`,
  `addIcon`, and `removeIcon` already cover those actions in combination.

**Consequences.**

- After an import, the palette equals the imported configuration. Icons a host
  added with `addIcon` that are not in the imported set leave the selection,
  but stay in the pool. Hosts re-add them after import if they want them.
- The order holds within a session. EGN stores icons as object keys, so names
  that look like integers are reordered when a file is saved and reopened.
- Built-in catalogs, filtering, drafts, reset, and cancellation are host
  concerns.

## <a id="ico-4"></a>ICO-4 — Artwork is a name-keyed pool that outlives the selection

- Status: accepted
- History: 2026-09-08 live assets retained on export (ADR 0025); 2026-09-11
  `addIcon` replaces by name and repaints (ADR 0027)

**Context.** Shapes look up artwork by icon name in one pool shared by actors
and work objects. Neither the API nor EGN v4 has an asset identity per
category. Removing or replacing an icon in the selection must remove it from
`getIcons()` and `hasIcon()` immediately, but existing elements still refer to
it. This caused two problems:

- Exports serialized only the selection, so saved files were missing the
  artwork of live elements.
- The pool kept the first artwork registered for a name. `addIcon()` with an
  existing name, even after a remove, kept the old artwork.

**Decision.**

- Story export writes the union of the selection and the icon names used by
  live actor and work-object elements, including elements inside groups.
  Names missing from the selection are filled from the pool under their
  original category and name. `getIcons()`, `hasIcon()`, and icon events stay
  selection-only. The v4 envelope does not change.
- `addIcon()` replaces by name. It validates and sanitizes the input first.
  Then it replaces the pool entry and the requested category's selected entry.
  If the other category also has that name selected, its artwork is refreshed
  too, but the name is not added to that category.
- After storing the artwork, the session republishes the CSS and fires
  `elements.changed` for every live shape that uses the icon. This is a
  repaint, not a command ([ARC-4](architecture.md#arc-4)). `icons.changed`
  fires last.

**Rejected alternatives.**

- **Delete or retag elements whose icon leaves the selection:** managing the
  selection must not change the user's diagram.
- **Add a separate retained-assets section to EGN:** this needs a new format
  version and migrations, for data that v4 readers can already render.
- **Require removing an icon before replacing it:** removal changes only the
  selection and keeps the artwork by design.
- **Keep artwork per category:** this changes the renderer, the query
  semantics, and the EGN representation.
- **Repaint through an undoable command:** replacing artwork does not change
  the model, so an undo entry would be misleading.

**Consequences.**

- Saved documents contain the artwork for every live element. Unrelated
  historical artwork stays out of the file.
- After reopening a file, retained icons appear in the creation palette,
  because EGN v4 cannot mark them as retained-only. This is accepted.
- An actor and a work object with the same name cannot show different
  artwork.

## <a id="ico-5"></a>ICO-5 — Starter icons are an optional, data-only package entry

- Status: accepted
- History: 2026-09-15 decided (ADR 0039)

**Context.** The core starts with an empty palette unless a host loads icons.
The demo carried its own `Person` and `Document` SVGs, so a host that wanted
the same minimal set had to copy them. Bundling them into the main entry would
make every consumer ship that artwork, including hosts with their own catalog.

**Decision.**

- `egon-core/icons` exports one frozen value, `defaultIcons`: a `Person`
  actor and a `Document` work object, under the set name `egon-default`.
- Hosts import it and pass it as `EgonClientConfig.defaultIcons`. The same
  option also accepts a custom `IconSetData`. If the option is omitted or
  `false`, the palette stays empty.
- Creation loads these icons once through `loadIcons`, before the creation
  promise resolves. If loading fails, the new client is destroyed and creation
  rejects.
- The option applies to initialization only. Later `loadIcons()` calls and
  imports replace the selection and never bring the starter icons back
  ([ICO-3](#ico-3)).

**Rejected alternatives.**

- **Load starter icons automatically from the main entry:** hosts with their
  own catalog would ship unused artwork, and the palette would no longer start
  empty.
- **Keep the icons only in the demo:** every host would copy the files and
  bypass the package contract.
- **Accept `defaultIcons: true` and load the icons internally:** this creates a
  hidden runtime dependency from the client to the artwork. Passing the data
  explicitly keeps tree-shaking visible and lets custom packs use the same
  path.

**Consequences.**

- Opting in costs one import. Apps that do not import the entry leave the SVGs
  out of their bundles, which the package consumer checks prove
  ([TST-3](testing.md#tst-3)). The package archive still includes them.
- `./icons` is deliberate public surface ([API-1](public-api.md#api-1)). It
  must stay free of framework, DOM, stylesheet, and registration side effects.
