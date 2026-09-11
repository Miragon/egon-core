# Architecture Decision Records

Significant architectural decisions for egon-core, recorded per
[ADR 0001](0001-record-architecture-decisions.md). See that ADR for the format
and the rules (when to write one, how superseding works).

| ADR                                                                      | Decision                                            | Status                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------- |
| [0001](0001-record-architecture-decisions.md)                            | Record architecture decisions as ADRs               | accepted                                                                    |
| [0002](0002-standalone-core-extracted-from-egon-io.md)                   | Extract a standalone modeling core from egon.io     | accepted                                                                    |
| [0003](0003-gpl-3.0-or-later-license.md)                                 | License under GPL-3.0-or-later                      | accepted                                                                    |
| [0004](0004-standalone-toolchain.md)                                     | Standalone build, test, and lint toolchain          | accepted                                                                    |
| [0005](0005-module-layout-and-architecture-tests.md)                     | Module layout, DDD layering, executable arch tests  | superseded by [0010](0010-flat-ddd-feature-layout-and-frozen-public-api.md) |
| [0006](0006-prettier-code-formatting.md)                                 | Format code with Prettier (existing-style config)   | accepted                                                                    |
| [0007](0007-adopt-egn-v4-file-format.md)                                 | Adopt EGN v4.0.0 as the canonical file format       | accepted                                                                    |
| [0008](0008-verbatim-icon-names-css-only-sanitization.md)                | Verbatim icon names; sanitize only for CSS          | accepted                                                                    |
| [0009](0009-icon-set-import-replaces-selection.md)                       | Icon-set import replaces the selection              | accepted                                                                    |
| [0010](0010-flat-ddd-feature-layout-and-frozen-public-api.md)            | Flat DDD feature layout + frozen public API         | accepted                                                                    |
| [0011](0011-adopt-align-to-origin.md)                                    | Adopt align-to-origin; expose align/fit-to-screen   | accepted                                                                    |
| [0012](0012-no-module-level-mutable-state.md)                            | Mutable state on classes; module scope stays pure   | accepted                                                                    |
| [0013](0013-two-tier-test-architecture.md)                               | Two-tier tests: unit (jsdom) + browser (chromium)   | accepted                                                                    |
| [0014](0014-canvas-driving-specs-are-browser-tier.md)                    | Canvas-driving specs are browser tier               | accepted                                                                    |
| [0015](0015-typed-rule-verdicts-at-the-grammar-adapter-seam.md)          | Typed rule verdicts at the grammar↔adapter seam     | accepted                                                                    |
| [0016](0016-rendering-is-read-only.md)                                   | Rendering is read-only; model writes are commands   | accepted                                                                    |
| [0017](0017-expose-import-repair-as-a-host-event.md)                     | Expose import repair as the `import.repaired` event | accepted                                                                    |
| [0018](0018-idempotent-event-subscriptions.md)                           | Make event subscriptions idempotent                 | accepted                                                                    |
| [0019](0019-reject-unknown-public-event-names.md)                        | Reject unknown public event names at runtime        | accepted                                                                    |
| [0020](0020-infrastructure-translates-domain-decisions.md)               | Infrastructure translates domain decisions          | accepted                                                                    |
| [0021](0021-public-consumer-playwright-journeys.md)                      | Public-consumer Playwright journey tier             | accepted                                                                    |
| [0022](0022-node-24-and-portless-demo-routing.md)                        | Node 24 and portless demo routing                   | accepted                                                                    |
| [0023](0023-sanitize-imported-svg-icons.md)                              | Sanitize imported icons at storage and render       | accepted                                                                    |
| [0024](0024-stage-document-imports-in-editor-sessions.md)                | Stage imports in isolated editor sessions           | accepted                                                                    |
| [0025](0025-retain-live-icon-assets-on-export.md)                        | Retain live icon assets on export                   | accepted                                                                    |
| [0026](0026-client-scoped-color-picker-requests-and-passive-previews.md) | Client-scoped picker requests + passive previews    | accepted                                                                    |
| [0027](0027-refresh-shared-icon-artwork-on-add.md)                       | Refresh shared icon artwork on add                  | accepted                                                                    |
| [0028](0028-export-static-svg-from-a-captured-session.md)                | Export static SVG from a captured session           | accepted                                                                    |
| [0029](0029-rasterize-png-with-cancellable-host-neutral-work.md)         | Cancellable host-neutral PNG rasterization          | accepted                                                                    |
| [0030](0030-batch-label-renames-through-one-parent-command.md)           | Batch label renames through one parent command      | accepted                                                                    |
| [0031](0031-expose-retained-icon-configuration-and-explicit-order.md)    | Expose retained icon configuration and order        | accepted                                                                    |
| [0032](0032-headless-replay-with-domain-traversal.md)                    | Headless replay with domain traversal               | accepted                                                                    |
