# Architecture Decision Records

Significant architectural decisions for egon-core, recorded per
[ADR 0001](0001-record-architecture-decisions.md). See that ADR for the format
and the rules (when to write one, how superseding works).

| ADR                                                           | Decision                                           | Status                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| [0001](0001-record-architecture-decisions.md)                 | Record architecture decisions as ADRs              | accepted                                                                    |
| [0002](0002-standalone-core-extracted-from-egon-io.md)        | Extract a standalone modeling core from egon.io    | accepted                                                                    |
| [0003](0003-gpl-3.0-or-later-license.md)                      | License under GPL-3.0-or-later                     | accepted                                                                    |
| [0004](0004-standalone-toolchain.md)                          | Standalone build, test, and lint toolchain         | accepted                                                                    |
| [0005](0005-module-layout-and-architecture-tests.md)          | Module layout, DDD layering, executable arch tests | superseded by [0010](0010-flat-ddd-feature-layout-and-frozen-public-api.md) |
| [0006](0006-prettier-code-formatting.md)                      | Format code with Prettier (existing-style config)  | accepted                                                                    |
| [0007](0007-adopt-egn-v4-file-format.md)                      | Adopt EGN v4.0.0 as the canonical file format      | accepted                                                                    |
| [0008](0008-verbatim-icon-names-css-only-sanitization.md)     | Verbatim icon names; sanitize only for CSS         | accepted                                                                    |
| [0009](0009-icon-set-import-replaces-selection.md)            | Icon-set import replaces the selection             | accepted                                                                    |
| [0010](0010-flat-ddd-feature-layout-and-frozen-public-api.md) | Flat DDD feature layout + frozen public API        | accepted                                                                    |
| [0011](0011-adopt-align-to-origin.md)                         | Adopt align-to-origin; expose align/fit-to-screen  | accepted                                                                    |
