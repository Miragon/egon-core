# 0007 — Store icon names verbatim; sanitize only at the CSS boundary

- Status: accepted
- Date: 2026-07-22

## Context

Custom icon names containing `.` (or other CSS-special characters) broke in
two places (issue #4, upstream wps/egon.io#264). `sanitizeIconName` treated
everything after the last dot as a file extension: importing an icon set
rewrote `my.icon.v2` to `my.icon` in the in-memory dictionaries, so exports
no longer carried the original name and re-imported stories no longer matched
their canvas business objects. The surviving interior dot then produced the
invalid selector `.icon-domain-story-my.icon::before`, so palette and
context-pad icons never rendered. Sanitization was smeared across three
layers — import, dictionary registration, and CSS generation — each mutating
the name differently.

## Decision

Icon names are data and stay verbatim everywhere they are stored or
exchanged: dictionary keys, export files, and the client `addIcon` API.
Sanitization happens exactly once, at the CSS boundary, via `sanitizeForCss`
(ported from upstream 15a85d42/7f469683/7b3e0842): every character outside
`[a-zA-Z0-9_-]` becomes `_`, a leading digit is prefixed with `_`, and the
result is lowercased. Rule generation (`addIconsToCss`) and class lookup
(`getCSSClassOfIcon`) compute the same function over the same verbatim key,
so they agree by construction.

`sanitizeIconName` is deleted: after the fix it had zero callers, it is not
part of the public API, and upstream keeps it only for its Angular upload UI
— filename handling is a host-app concern, not this core's.

The fork's `mask-image` CSS mechanism (miragon/egon.io#15/#17) is kept in
preference to upstream's `content: url(...)`; only the class naming was
broken.

## Alternatives considered

- **Make `sanitizeIconName` strip dots everywhere** — still lossy: the
  stored name diverges from the user's name, so export→import round-trips
  keep breaking. Sanitizing storage keys is the root cause, not the fix.
- **Escape selectors with `CSS.escape` instead of mapping to `_`** — yields
  valid but unreadable classes and diverges from upstream's class names,
  complicating future ports for no user-visible gain.

## Consequences

- Export→import round-trips preserve names exactly; dot-named icons render
  and are no longer silently dropped on import.
- Distinct names can collide to the same class (`My.Icon` and `my_icon` both
  → `icon-domain-story-my_icon`); the last-inserted rule wins. Known and
  accepted — same behavior as upstream.
- Regression tests pin the contract: `sanitizer.spec.ts` (mapping),
  `IconDictionaryService.spec.ts` (generated rule matches the looked-up
  class), `IconSetImportExportService.spec.ts` (verbatim round-trip).
- Any downstream code that relied on receiving pre-sanitized keys must now
  handle verbatim names.
