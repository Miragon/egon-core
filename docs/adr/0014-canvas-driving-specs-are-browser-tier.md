# 0014 — Canvas-driving specs are browser tier

- Status: accepted
- Date: 2026-07-26

## Context

[ADR 0013](0013-two-tier-test-architecture.md) split the suite into a fast jsdom
`unit` tier and a real-chromium `browser` tier, and justified the browser tier
with the one case known at the time: a full `EgonClient.create()` boot. It did
not say where the _next_ wave of specs goes.

The modeling-command integration suite ([#55](https://github.com/Miragon/egon-core/issues/55))
forced the question. That issue's title proposes "real `Diagram` in jsdom" — the
bpmn-js test-helper approach — with only geometry-dependent cases pushed to the
browser. Attempted here, the jsdom premise does not hold. Four independent
blockers, each verified against this repo:

1. **No modeling command can execute at all.** `canvas.addShape` →
   `GraphicsFactory.update` → tiny-svg `translate()` →
   `SVGSVGElement.createSVGTransform`, which jsdom does not implement. The repo
   already documents this: `DomainStoryLabelEditingPreview.spec.ts:15` `vi.mock`s
   `diagram-js/lib/util/SvgTransformUtil` for exactly this reason. Mocking it
   away in an integration suite would mock away the thing under test.
2. **Automatic numbering is not in a command handler.** It runs in
   `DomainStoryRenderer.renderExternalNumber`, reached from `drawActivity`, so
   covering it requires a real draw pass. Stubbing the renderer defeats the test.
3. **`getBBox` returns `{width: 0}`**, so `DomainStoryTextRenderer.getExternalLabelBounds`
   yields 0 and `DomainStoryUpdateLabelHandler.postExecute` would resize
   annotations to width 0 — a number no browser ever produces. Annotation
   height restore is specifically in scope for #55.
4. **`canvas.viewbox().outer` is `{0,0}`** (`clientWidth === 0`), so
   `fitToScreen()` yields `NaN`.

## Decision

**If a spec causes `canvas.addShape` or `canvas.addConnection` to run — directly,
or via `modeling.*`, `commandStack.execute`, `copyPaste.*`, or `import()` — it is
a browser-tier spec and its filename ends in `.browser.spec.ts`. Canvas-free
specs stay in the fast jsdom `unit` tier.**

Two harness entry points, side by side, neither wrapping the other:

- `createTestDiagram()` — boots `EgonClient`; for public-API specs.
- `createTestModeler()` — boots the same graph via `DiagramJsModelerAdapter` and
  exposes the injector (`canvas`, `commandStack`, `elementRegistry`, `modeling`,
  `rules`); for command-level specs. It builds on the production adapter rather
  than a hand-rolled `new Diagram(...)` so the harness and the app boot
  identically — a harness that boots differently tests a fiction.

Specs that only need an `EventBus` — the property-copy and paste-restore
listeners, the numbering registry's arithmetic — remain unit tier. That is not a
compromise: a canvas would add nothing there.

This **sharpens ADR 0013; it does not supersede it.** Per ADR 0001 an accepted
ADR is never edited into a different decision, and 0013's own decision (two
projects, shared `src/__tests__/` infrastructure, unit-only coverage) stands
unchanged.

No tooling change is needed: tier routing is the `.browser.spec.ts` suffix, and
`test-browser` is already part of the required `ci` gate.

## Alternatives considered

- **Real `Diagram` in jsdom, per #55's title** — rejected on the four blockers
  above. Blocker 1 alone is fatal: it is not that _some_ assertions would be
  weaker, it is that no command runs.
- **`vi.mock` `SvgTransformUtil` in the integration suite** (the existing
  preview spec's trick) — rejected. That spec mocks it to unit-test one
  function's arguments; doing it across a suite whose subject _is_ the
  canvas wiring would leave positions, waypoints and bounds untested while
  reading as though they were covered.
- **Move everything to the browser tier** — rejected: it would slow the default
  `yarn test` loop and drop the moved specs out of coverage, which is unit-only.

## Consequences

- The browser tier grows from 2 spec files to ~8, and is where sync regressions
  in modeling behaviour will now surface. Keep it honest about cost: one
  `createTestModeler()` per `it` with `afterEach` cleanup, because leaked
  canvases — not file count — are what makes this tier slow.
- Coverage numbers do not move: thresholds are glob-scoped to `src/**/domain/**`
  and this suite adds no domain code. A browser-tier spec contributes no
  coverage, so genuinely pure logic must still be unit-tested.
- The harness earned its keep immediately, as 0013's did. The first group case
  found two live bugs that no mock-based spec could reach:
  `DiagramJsModelerAdapter` installed a root built by
  `elementFactory.createRoot()` (id `root_<n>`), but `isBackground` identifies
  the canvas background by the `__implicitroot` prefix — so creating a group on
  the bare canvas threw `TypeError` inside `reworkGroupElements`; and that
  function plus `undoGroupRework` called `.add()`/`.remove()` on
  `element.children`, which is a plain Array. Both fixed in the same change.
- Deferred deliberately, and recorded on #55: number-badge placement, text
  wrapping and exact waypoint pixels ([#56](https://github.com/Miragon/egon-core/issues/56),
  real SVG geometry); context-pad and palette interaction (#56); OS-clipboard
  Ctrl+C/Ctrl+V ([#57](https://github.com/Miragon/egon-core/issues/57)).
