# 0017 — Expose import repair to hosts as the `import.repaired` event

- Status: accepted
- Date: 2026-07-28

## Context

`DomainStoryImportService` repairs a damaged file rather than rejecting it:
`pruneUnreferencedConnections` drops activity edges whose endpoint is not in the
document, because diagram-js would otherwise be handed a connection with
`undefined` ends. The story loads; the dropped edges are gone. If the host then
saves, the loss becomes permanent in the user's file — silently.

The service already fired `dst.import.repaired` on the internal diagram-js bus
with the dropped business objects. Nothing consumed it. It was left internal on
purpose: ADR 0010 froze the public API to `EgonClient` plus types, and said
widening it needs its own decision. A host could technically subscribe by
injecting a listener through `additionalModules`, but that is the
advanced-integration escape hatch, not an API — it requires knowing an
undocumented event name and reading the internal model objects it carries.

The 2026-07 review flagged the event as unreachable wiring and
[#84](https://github.com/Miragon/egon-core/issues/84) offered two options: drop
it as dead, or expose it. Dropping it would delete the only signal that an
import was lossy, and that signal is the whole reason
`pruneUnreferencedConnections` returns the dropped edges instead of upstream's
discarded boolean (see SYNC.md).

## Decision

**Widen the frozen public API by exactly one event.** `EgonClient` gains
`import.repaired`, alongside `story.changed`, `viewport.changed` and
`icons.changed`, carrying `ImportRepairData`:

```ts
export interface ImportRepairData {
    removedConnectionIds: string[];
}
```

The internal `dst.import.repaired` fire stays where it is and becomes the
internal half of the public event: `DiagramJsModelerAdapter` subscribes,
projects `event.removedConnections` down to their ids, and hands them through
`ModelerPort`. It is added to `FROZEN_INDEX_SPECIFIERS`' existing `ModelerPort`
module, so `architecture.spec.ts` rules G1/G2 stay green without editing the
frozen lists — the type rides a specifier that is already public, and no new
runtime value is exported.

Two shape decisions inside that:

- **Ids, not business objects.** The dropped elements are internal model
  objects; handing them out would leak the model representation across the port
  and invite hosts to write to it. A host's sensible reaction is to tell the
  user the file was lossy and name what went missing, which ids cover.
- **No debounce**, unlike the other two modeler events. An import is one
  discrete host-triggered action that fires this at most once, and the host
  needs the warning before `import()` returns — i.e. before it can offer a save
  that would overwrite the original.

## Alternatives considered

**Drop the event (the issue's other option).** Rejected: the repair is real and
lossy, and this is the only signal that it happened. Deleting it would make
silent data loss the permanent behaviour and would strand
`pruneUnreferencedConnections`' deliberate return value.

**Leave it internal and document `additionalModules` as the way in.** Rejected:
that pins an internal event name and its internal payload as a de-facto
contract, which is strictly worse than a typed public one — a rename inside the
core would break hosts with no compiler signal.

**Return the repair from `import()` instead of firing an event.** Rejected: it
would change an existing public signature (a breaking change) to carry
information that is empty on the overwhelmingly common path, and it does not
compose with the event-subscription model the other three signals use.

## Consequences

- **The frozen public API is no longer only-shrinking.** ADR 0010's freeze is a
  gate, not a ban; this is the first widening to pass through it. The precedent
  is: one named event, one type, on an already-public specifier, with an ADR.
- **`ModelerPort` grows two methods** (`onImportRepaired` / `offImportRepaired`),
  so every implementation — including test doubles — must supply them. That is
  the intended pressure: a port method is how the core states what a host may
  rely on.
- **The repair payload is now a compatibility surface.** Widening
  `ImportRepairData` later (e.g. dropped shapes, a reason code) is additive and
  safe; renaming `removedConnectionIds` is not.
- **A host that ignores it is exactly as safe as before** — the event is
  additive and fires only when something was actually dropped, so subscribing is
  itself the "was this file damaged?" question.
