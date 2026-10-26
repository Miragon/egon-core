# Testing

Test tiers, coverage, the domain mutation gate, and how the published package
is validated.

## <a id="tst-1"></a>TST-1 — Two test tiers: fast jsdom unit tests, real-Chromium browser tests

- Status: accepted
- History: 2026-07-24 decided (ADR 0013); 2026-09-14 Vitest 4 provider and
  explicit coverage inputs (ADR 0036)

**Context.** A real `EgonClient.create()` boot cannot run under jsdom.
diagram-js measures SVG with `getBBox`, which jsdom reports as zero, so the
canvas never renders and the boot path goes untested. The local `yarn test`
loop must stay fast. Downloading a browser and rendering for real on every run
would push people to skip tests.

**Decision.**

- There are two Vitest projects:
    - `unit` runs under jsdom and is the default for `yarn test`,
      `test:watch`, and `test:coverage`. Ports and diagram-js are mocked here.
    - `browser` runs headless Chromium through `@vitest/browser-playwright` and
      includes only `*.browser.spec.ts` files. It runs with `yarn test:browser`
      locally and as a separate required `test-browser` job in CI.
- Shared helpers and fixtures live in `src/__tests__/`, which the architecture
  scans skip. `importFixture` loads fixtures as JSON modules and clones them on
  every call, so the same registry works in Node, jsdom, and the browser.
- Coverage:
    - It runs in the unit tier only.
    - It explicitly includes every source file, so untested production files
      count.
    - It gates `src/**/domain/**` with the thresholds in `vite.config.mts`.
    - Thresholds only go up. Never lower a threshold or exclude production files
      to make a build pass.
- Vitest, its browser provider, and its coverage packages are pinned to the
  same version.

**Rejected alternatives.**

- **One environment for everything (happy-dom or a heavier jsdom shim):** no
  DOM shim computes real SVG geometry.
- **Coverage thresholds for all of `src`:** most infrastructure code is
  reachable only from the browser tier, which reports no coverage. A global
  gate would either be trivially low or force brittle mocks.

**Consequences.**

- CI has a slower, separate browser job. The local loop is unchanged.
- A browser spec must end in `.browser.spec.ts`. Otherwise it runs under jsdom
  and fails on `getBBox`.
- Browser specs add no coverage, so pure logic needs unit tests to count.

## <a id="tst-2"></a>TST-2 — Specs that drive the canvas are browser tier

- Status: accepted
- History: 2026-07-26 decided (ADR 0014)

**Context.** The modeling-command suite (#55) was meant to use a real
`Diagram` in jsdom, but jsdom cannot support it:

- `canvas.addShape` reaches tiny-svg's `translate()` and then
  `SVGSVGElement.createSVGTransform`, which jsdom does not implement. No
  modeling command can run at all.
- `getBBox` returns zero, so label bounds and annotation resizing produce
  numbers no browser would.
- `canvas.viewbox().outer` is `{0,0}`, so `fitToScreen()` returns `NaN`.

**Decision.** A spec belongs in the browser tier if it causes
`canvas.addShape` or `canvas.addConnection` to run. That includes calls
through `modeling.*`, `commandStack.execute`, `copyPaste.*`, or `import()`.
Specs that never touch the canvas stay in the unit tier, for example event-bus
listeners, numbering arithmetic, and policies.

There are two harness entry points:

- `createTestDiagram()` boots `EgonClient`, for public-API specs.
- `createTestModeler()` boots the same graph through the production
  `DiagramJsModelerAdapter` and exposes the injector, for command-level specs.

Never hand-roll a `new Diagram(...)`. A harness that boots differently from
the app tests something that does not exist. By convention, each spec's header
comment explains why the spec is in its tier.

**Rejected alternatives.**

- **A real `Diagram` in jsdom:** no command runs.
- **Mock `SvgTransformUtil` across an integration suite:** this mocks away the
  thing under test while looking like coverage.
- **Put everything in the browser tier:** this slows the default loop and drops
  specs out of coverage.

**Consequences.**

- Modeling regressions show up in the browser tier. To keep that tier cheap,
  create one `createTestModeler()` per `it` and clean it up in `afterEach`.
  Leaked canvases slow the tier down far more than the number of spec files.

## <a id="tst-3"></a>TST-3 — Public journeys run against the installed package

- Status: accepted
- History: 2026-09-06 Playwright journeys against the source demo (ADR 0021);
  2026-09-11 the same journeys run through an isolated package consumer (ADR
  0028); 2026-09-15 tree-shaking checks for the icons entry (ADR 0039)

**Context.** Browser-tier fixtures may use infrastructure classes and the
injector. That is right for focused tests, but it does not prove that a host
can build an editor from the published contract. A demo built from source can
also pass while the package itself is broken, for example through:

- missing files
- wrong exports
- invalid CSS asset URLs
- undeclared runtime dependencies
- an incomplete `egon-core/style.css`

**Decision.**

- `demo/__tests__/` holds a thin Playwright tier: user journeys plus focused
  stylesheet and asset checks. The journeys cover drawing and numbering,
  connecting with renumbering and undo/redo, label editing with autocomplete,
  recoloring, and export/reset/import with malformed input.
- Journeys use only the mouse and keyboard. They may inspect the DOM, rendered
  bounds, and exported JSON. They never reach into modeler internals or seed a
  story programmatically.
- The demo in `demo/` acts as a consumer. It imports only `egon-core`,
  `egon-core/icons`, and `egon-core/style.css`, and ESLint enforces this. For
  local development, exact Vite aliases and TypeScript paths map those
  specifiers to the source.
- `yarn test:package` runs the same suite against the installed package:
    1. It packs the checkout, or takes an existing `.tgz`.
    2. It copies only the demo into a temporary project outside the repository.
    3. It installs the archive with exactly pinned Vite and TypeScript 7.
    4. It validates the asset URLs in the installed stylesheet.
    5. It type-checks and production-builds the consumer.
    6. It runs the same Playwright suite against that build on its own portless
       route.

    No workspace link, source alias, or repository `node_modules` takes part in
    resolving the consumer. The run also builds a client-only consumer and one
    that imports the icons entry, to prove that unused starter artwork is
    tree-shaken out ([ICO-5](icons.md#ico-5)).

- Release archives go through the same runner
  ([REL-2](release-and-distribution.md#rel-2)).

**Rejected alternatives.**

- **Only extend the Vitest browser tier:** injector-level fixtures can pass
  while the public API or real interactions are broken.
- **Move integration coverage to Playwright:** focused cases are faster and
  clearer in Vitest. The journeys are an acceptance layer, not a replacement.
- **Keep source imports and add CSS assertions:** the package could still be
  unusable.
- **Maintain a second, package-only demo or suite:** the two would drift and
  weaken the comparison between source mode and installed mode.

**Consequences.**

- Each journey gets a fresh browser context, and CI uploads screenshots and
  traces on failure. Package mode costs an extra install and production build
  in CI.
- The acceptance environment is Chromium, Node 24, Yarn 4, and portless.
- The demo also serves for manual exploration, but deliberately has no
  persistence, dialogs, downloads, or clipboard integration.

## <a id="tst-4"></a>TST-4 — Gate domain code on per-file mutation scores

- Status: accepted
- History: 2026-10-26 decided (ADR 0041); Stryker setup and rollout tracked in
  #175
- Enforced by: the per-file gate script and a raw-source rule for disable
  comments in `src/architecture.spec.ts`. Both arrive with #175 and are not in
  the repository yet.

**Context.** At `32075e3` the domain layers had 99.1% statement coverage but
an 85.1% Stryker mutation score: 124 surviving mutants, 52 of which pointed at
missing assertions. Coverage cannot detect a missing rule. The
group-as-activity-source bug (#181) sat in a domain function with 99% branch
coverage.

Stryker's `thresholds.break` applies to a whole run only. A global threshold
lets a new file at 60% pass behind the legacy average, and raising it to 100%
would block every PR until the existing survivors are resolved.

Outside the domain, mutation testing is not ready to act as a gate. The
service layer scores 69.4% in the unit tier, with 166 mutants that no unit
test reaches, and the browser tier costs about one second per mutant per
worker.

**Decision.** Stryker (`@stryker-mutator/core`, `vitest-runner`, and
`typescript-checker`, exactly pinned per [ENG-1](engineering-practices.md#eng-1))
is the quality gate for `src/**/domain/**` only.

- **Runner setup.**
    - Stryker uses its own Vitest config that contains only the unit project.
    - It uses `perTest` coverage analysis, the TypeScript checker, and
      `ignoreStatic: false`.
    - `src/architecture.spec.ts` is excluded, because it scans raw sources.
- **Per-file gate.** A script reads Stryker's JSON report and checks every
  domain file against `mutation-baseline.json`. The score is
  `(killed + timeout) / (killed + timeout + survived + no coverage)`. Ignored
  mutants and compile errors do not count.
    - A file missing from the baseline (a new file) must score 100%.
    - A listed file must not fall below its floor.
    - Stale entries fail the gate.
    - The global `break` threshold stays as a backstop.
- **Ratchet.** Floors only move up. A PR that raises a file's score raises its
  floor in the same PR. Lowering a floor requires a decision here. A moved
  file keeps its floor only through a visible baseline edit.
- **Equivalent mutants.** First remove them by simplifying the code: delete
  redundant guards and use exact comparisons. If that is not possible,
  annotate the line with
  `// Stryker disable next-line <Mutator>[,<Mutator>]: <reason>`. Block-wide,
  file-wide, and `all` disables are not allowed in domain code.
- **Test-first.** A domain change starts with a failing spec: a new object
  starts with its specification, and a bug fix with its regression test. No
  tool can prove test-first. Surviving mutants are the evidence that code was
  written ahead of its tests.
- **Where it runs.**
    - Locally, use incremental runs for the TDD loop.
    - In CI, every PR gets a full, non-incremental domain run plus the gate, as
      a job under the `ci` aggregate.
    - Incremental mode is not used in CI because it cannot see changes to
      dependencies, or to unmutated files that domain specs import.

**Rejected alternatives.**

- **Coverage thresholds only:** they measure execution, not assertions. The
  domain already had 99% coverage and still contained #181.
- **Only a global `break` threshold:** new files can hide behind the average,
  and a global threshold cannot require new code to reach 100%.
- **Mutate service and infrastructure code on every PR:** rejected for now.
  Most of that code is reachable only from the browser tier, which costs too
  much per mutant. A weekly, non-gating run may follow.
- **Incremental runs in CI:** the gate could go stale without anyone
  noticing.

**Consequences.**

- Assertion strength is measured where logic is pure and tests are cheap.
  This rewards moving policy into the domain ([ARC-3](architecture.md#arc-3),
  [ARC-7](architecture.md#arc-7)).
- The opposite pressure is real: keeping logic out of `domain/` avoids the
  gate. Reviewers counter it with ARC-3's classification.
- Domain code that only browser tests reach scores as "no coverage" and needs
  unit specs. This is intended.
- CI gains a job of several minutes (about 3 minutes locally at `32075e3`) and
  three pinned dev dependencies.
- Production code carries a reviewed comment for each annotated equivalent
  mutant.
