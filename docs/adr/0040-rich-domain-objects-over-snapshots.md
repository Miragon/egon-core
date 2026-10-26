# 0040 — Rich domain objects over snapshots; diagram-js remains the system of record

- Status: accepted
- Date: 2026-10-26

## Context

The domain layers (ADR 0010) are a functional core: interfaces plus free
functions. The only classes are `Dictionary`, `EgnExportFile`, and an unused
`Viewport`. ADR 0020 moved notation policy and geometry into the domain, but
no domain object owns an invariant. The architecture review for epic #173
found the consequences:

- Activity numbering is spread over seven or more sites, and three
  infrastructure sites restate "a step is an actor-sourced activity".
- Group nesting, cycle prevention, and adoption live entirely in
  `DomainStoryUpdater`, a diagram-js `CommandInterceptor`.
- `CanvasObject` (`src/story/domain/canvasObject.ts`) mirrors diagram-js's
  element graph (`host: any`, `attachers: any`, `incoming`, `outgoing`). The
  import-based purity rule cannot see framework leakage by shape.
- `BusinessObject` is the wire DTO, the domain record, and the diagram-js
  attribute bag at once, which is the root of the #65/#74 class of bugs.

diagram-js owns element identity, mutation, and undo through its command
stack. The upstream sync (`SYNC.md`) depends on keeping upstream's file and
method names reviewable.

## Decision

Domain objects own invariants and return **decisions**: the changes a command
should make. Infrastructure command handlers and interceptors apply those
decisions through diagram-js, so identity, mutation, and undo stay with
diagram-js. This extends ADR 0020 ("infrastructure translates domain
decisions") from free functions to objects that hold an invariant.

- **Inputs are domain snapshots**, not framework-shaped objects: a
  `StoryGraph` and persisted element records, built by infrastructure from the
  element registry. They replace `CanvasObject` (#201).
- **A classic aggregate only where diagram-js does not own the state.**
  `IconCatalog` (#200) owns the icon pool. Everything element-shaped stays in
  the registry.
- The planned objects are `ElementType` (#196), `ActivitySequence` (#197),
  `GroupTree` (#198), the label dictionary projection (#199), `IconCatalog`
  (#200), and `StoryGraph` (#201).
- Pure functions without an owned invariant stay functions. A class is
  introduced only for an invariant it protects.
- Logic moved out of an upstream-mapped file keeps upstream's names where they
  exist, and `SYNC.md` records where it went.
- Domain objects are written test-first and gated by per-file mutation scores
  (ADR 0041). Unfinished work is delivered through trunk-based development
  without feature flags in the domain (ADR 0042).

Vocabulary: the feature folders are modules of **one** bounded context,
Domain Storytelling, and `modeler/` is its application and adapter layer.
Where ADR 0010 calls `modeler/` "the canvas/model context", read "context"
as "module".

## Alternatives considered

- **A `DomainStory` aggregate that owns elements alongside diagram-js.**
  Rejected because every built-in diagram-js command would need two-way
  synchronization, undo would have to be re-implemented, and upstream sync
  would become far more expensive.
- **A domain event bus.** Rejected because the command stack already is the
  event source. #203 types the existing events instead.
- **Keep the functional core unchanged.** Rejected because without an owner,
  invariants keep being restated per call site. That is how the group-source
  (#181) and hidden-number (#182) bugs slipped through near-total line
  coverage.
- **Move ports into an `application/` folder.** Rejected as a rename without a
  behavioural gain that would churn imports and the sync mapping.

## Consequences

- Invariants become testable without a canvas, and the mutation gate
  (ADR 0041) applies to them.
- Adapters and interceptors shrink to translation. The adapter's size is a
  progress measure alongside the mutation score.
- Snapshots must be built from the registry for each decision. Build them per
  command, not per render, to keep large diagrams responsive.
- Two representations exist, snapshot and element, and their mapping lives in
  infrastructure. That mapping needs its own tests (browser tier, ADR 0014),
  because the mutation gate does not cover it.
- Sync diffs from upstream may land in different files than before; `SYNC.md`
  carries the extra mapping.
