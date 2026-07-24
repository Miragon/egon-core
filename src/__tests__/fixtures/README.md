# Shared test fixtures

Domain-story export files spanning every on-disk format this library must read.
Shared across the whole test suite (import-compatibility, normalizer, round-trip,
and browser-tier boot specs) via `src/__tests__/helpers/importFixture.ts`, which
imports them as JSON modules so they load in node, jsdom, and browser mode alike.

## Upstream fixtures

Real Egon.io export files, kept verbatim so the specs assert against exactly what
Egon.io writes.

- **Source:** [`wps/egon.io`](https://github.com/wps/egon.io) at commit `6b5dd60`,
  `src/app/tools/import/services/test-files/`.
- **License:** GPL-3.0 — identical to this repository, so redistribution here is
  compatible.

| File                                 | Shape                          | `domain`/`dst` payload                  |
| ------------------------------------ | ------------------------------ | --------------------------------------- |
| `dst_export_version_1_0_0` … `1_5_0` | legacy `{ domain, dst }`       | JSON **strings** (the crash this fixes) |
| `dst_export_version_2_2_0`           | legacy `{ domain, dst }`       | JSON objects                            |
| `egn_export_version_4_0_0`           | new `{ iconSet, domainStory }` | —                                       |

## Self-authored fixtures

Hand-authored canonical stories used by the harness helpers and the browser
smoke test. Self-authored for this repository and therefore GPL-3.0-compatible.
They reuse the Egon.io **default** icon set (the same actor/work-object SVGs the
upstream fixtures carry) so every referenced type resolves to a real icon when
the story is imported onto a live canvas.

| File                        | Shape                          | Content                                                            |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `egn_cinema_story.egn.json` | new `{ iconSet, domainStory }` | The Domain Storytelling "cinema" example (4 shapes, 3 activities). |
