# 0020 — Infrastructure translates domain decisions

- Status: accepted
- Date: 2026-09-06

## Context

ADR 0010 establishes framework-free domain layers, but it does not prevent an
infrastructure adapter from importing domain predicates and making notation
policy itself. Thirteen production infrastructure files directly import
`src/story/domain/elementPredicates.ts`. Some branches are legitimate adapter
work—framework lifecycle, presentation, and type dispatch—while others decide
what the notation permits or means.

Issue #70 audited the highest-risk adapters. It also found label-positioning and
segment-selection calculations in infrastructure even though they depend only
on coordinates. ADR 0015 already handles the related grammar seam correctly:
its four typed verdicts, exhaustive wire translation, and distinct `null` and
`undefined` outcomes remain unchanged.

## Decision

Infrastructure translates domain decisions into diagram-js, DOM, and SVG
behavior. A branch is classified by its effect, not merely by being a
conditional: notation policy belongs in domain; pure, framework-free geometry
belongs in domain; framework translation, presentation, and type dispatch may
remain in infrastructure.

Move activity label positioning and `selectPartOfActivity` together to
`src/modeler/domain/labeling/position.ts`. Keep their established calculations
and internal function names, and model coordinates as
`Pick<Waypoint, "x" | "y">` because the geometry neither needs nor receives a
waypoint's `original` field.

Add an architecture-test ratchet for direct production infrastructure imports
of `story/domain/elementPredicates`. Freeze the current 13-file allowlist: new
importers fail, and entries must be removed when their dependency disappears.
The allowlist may only shrink through review. The cap remains strict even when
a new direct dependency would be used only for legitimate type dispatch.

The conditional inventory and deferred candidates are recorded in
`docs/infrastructure-decision-audit.md`.

## Alternatives considered

**Ban conditionals from infrastructure.** Rejected because adapters must branch
on framework state, presentation state, and concrete types to translate domain
results into UI behavior.

**Ban every domain-predicate import immediately.** Rejected because it would
combine several unrelated policy extractions and adapter redesigns into one
change, increasing behavioral risk.

**Permit reviewed additions to the allowlist.** Rejected in favor of a simple
ratchet. A legitimate new adapter must receive a domain-facing decision API
instead of increasing direct predicate coupling.

**Replace ADR 0015's verdicts with the older three-state sketch.** Rejected
because it would erase the intentional `null` versus `undefined` distinction
and change bulk-create versus bulk-move behavior.

## Consequences

- Label geometry is framework-free, typed to the data it actually consumes, and
  directly imported by the renderer from domain.
- New direct infrastructure dependencies on the central predicates fail CI,
  while stale exceptions also fail so the allowlist cannot silently fossilize.
- Existing predicate dependencies remain temporarily accepted and visible;
  audited policy candidates require separate behavior-preserving extractions.
- The rule caps direct dependencies only. It cannot prove existing adapters are
  policy-free, and it cannot detect equivalent decisions expressed through
  other helpers. The audit and review remain necessary.
- No public API, file format, dependency, or intended runtime behavior changes.
  Malformed geometry inputs retain their existing assumptions.
