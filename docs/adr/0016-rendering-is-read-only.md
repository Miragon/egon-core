# 0016 — Rendering is read-only

- Status: accepted
- Date: 2026-07-27

## Context

`DomainStoryRenderer` wrote to the model it was asked to paint. Eight writes, of
two kinds:

- **Corrections**: the activity overlap nudge (`point.y += lineOffset`) and the
  default colour (`pickedColor = "#000000"` / `= "black"`, two writers
  disagreeing on the literal).
- **Ownership**: the element `type`, the activity number (both _minting_ one for
  an actor-sourced activity and _clearing_ it for every other), the annotation
  box height (mirrored onto `businessObject.number`), and the host's
  unsaved-changes flag.

Three properties of a repaint make any of these a defect:

1. **It is not a user action.** A selection, a scroll-into-view or a sibling's
   change repaints an element. A write there is invisible to `commandStack`, so
   it cannot be undone and does not participate in a transaction.
2. **It happens an unbounded number of times.** A correction that reads its own
   output accumulates. [#65](https://github.com/Miragon/egon-core/issues/65)
   measured it: `connection_8174`'s persisted start `y` is 172 / 177 / 182 / 187
   across the v1.1.0→v1.4.0 fixtures — 5px of silent file corruption per open,
   until a guard's ceiling happened to stop it.
3. **For an imported story the canvas shares the business objects with the
   file.** `DomainStoryImportService` aliases them via
   `assign({ businessObject }, businessObject)` and nothing on that path clones,
   so `element.waypoints` **is** `businessObject.waypoints`. Drawing writes
   straight into what the next export emits.

[#65](https://github.com/Miragon/egon-core/issues/65) fixed the two corrections
by making them copy-based. It left the six ownership writes, because each needed
a decision about _who_ should own the write rather than a local fix.
[#74](https://github.com/Miragon/egon-core/issues/74) made those decisions.

## Decision

**Drawing is a read. No file under a `renderer/` folder may mutate an element,
its business object, or any service that records state. Every mutation of the
model belongs to a command handler, an import repair, or the export pass —
somewhere undo can see it.**

Where the six writes went:

| write                    | new owner                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `businessObject.type`    | `DomainStoryCopyPaste` — paste was the only path that left it unset                                    |
| activity number, minted  | `DomainStoryActivityNumbering`, a `CommandInterceptor` on `connection.create` / `connection.reconnect` |
| activity number, cleared | the same interceptor; `ActivityDirectionChangedHandler` for its own swap                               |
| annotation height        | nothing — `element.height` was already correct and already exported                                    |
| legacy annotation height | `useLegacyAnnotationNumberAsHeight`, an import repair                                                  |
| dirty flag               | `DomainStoryDirtyFlagUpdater`, off `commandStack.changed`                                              |

Two behaviours that only existed because a repaint ran also had to be re-homed,
or the change would have been a silent regression rather than a refactor:

- A hand-made file's missing activity numbers were minted by the first paint.
  They are filled once, on import, by `numberActivitiesFromActors`.
- `element.updateLabel` blanks an activity's number, and the following repaint
  put it back. `DomainStoryUpdateLabelHandler` now writes only the half its
  caller supplied.

The rule is enforced two ways, because neither is sufficient alone:

- `architecture.spec.ts` rule I — a raw-source scan for assignments through
  `businessObject`/`semantic` and for `assign()` with a non-literal first
  argument. Syntactic, therefore conservative: an aliased write would slip past.
  It is a ratchet against the regression, not a proof.
- `RendererModelPurity.browser.spec.ts` — repaints and diffs every business
  object. This is the real proof, and it needs the browser tier (ADR 0014).

## Consequences

- **The emitted bytes narrow**: annotations no longer carry `number`, and
  `activity.directionChange` writes `null` rather than `0` for "no number". Safe
  against our own reader (`height` is authoritative and `null` is what every
  fixture already holds) and against upstream's (whose export writes `height`
  too), but it is a real format change and belongs in release notes.
- **Numbering must now name every path that changes an activity's source.** While
  it lived in the draw pass, any such path was covered for free by being
  repainted. `connection.create`, `connection.reconnect` (and thus
  `shape.replace`, whose `preExecute` re-points connections through
  `modeling.reconnectStart`/`reconnectEnd`) and `activity.directionChange` are
  covered; a fifth path would surface in
  `popup/__tests__/ActivityNumbering.browser.spec.ts`.
- **The renderer's DI shrinks from eight injections to five** (`eventBus`,
  `styles`, `canvas`, the text renderer and the icon dictionary), and its didi
  module from six dependencies to two: the numbering registry, the dirty-flag
  service, the element registry, the command stack and the number stash all
  existed to serve writes. The number stash mechanism
  (`DomainStoryNumberStash`, its didi module and the label provider's
  `stashNumber` call) is deleted outright: it carried a number across the redraw
  that direct-editing triggered, which stopped being a thing when
  [#77](https://github.com/Miragon/egon-core/pull/77) made `activity.changed` one
  atomic command. Its `use` flag was already unreachable.
- **The dirty flag means "the undo stack is non-empty"**, not "differs from the
  last save". Coarser than a save marker but honest, and strictly better than
  "something was painted". A host that wants a save marker needs an API for it.
- **ADR 0014's context paragraph is superseded as fact.** Its second jsdom
  blocker — "automatic numbering is not in a command handler … so covering it
  requires a real draw pass" — is no longer true. Per ADR 0001 that ADR is not
  edited: its _decision_ (canvas-driving specs are browser tier) stands
  unchanged and still applies to every numbering spec, since they all run
  `modeling.*`.
- Two smaller things ride along, both previously masked by a renderer write:
  `getIconSvg` compared `pickedColor !== "#000000"` and so read a pre-#65 file's
  persisted `"black"` as a custom colour, firing a bogus `errorColoringOnlySvg`
  for a raster icon — it now asks `story/domain/color.isDefaultColor`. And
  `DomainStoryPasteRestore` no longer stashes an annotation's height at all:
  diagram-js carries `descriptor.height` and the element factory honours it, so
  the stash was only ever needed because it read fields a live canvas does not
  maintain. Verified by disabling it against the browser spec, not by reading
  the diagram-js source.
