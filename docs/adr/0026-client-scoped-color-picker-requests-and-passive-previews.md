# 0026 — Route color picking through client-scoped requests and passive previews

- Status: accepted
- Date: 2026-09-11

## Context

Color picking crossed the host boundary through document-level
`openColorPicker`, `defaultColor`, and `pickedColor` events. Those events carried
no client identity or request ownership. Two modelers in one document could
therefore respond to one result, a delayed result could act on a deleted or
replaced element, and hosts could not distinguish a current picker from one
invalidated by selection, command, import, or teardown.

Hosts also need repeated visual previews. Writing a preview into
`businessObject.pickedColor` would persist an unconfirmed choice, dirty the
story, enter undo history, and violate rendering's read-only rule (ADR 0016).
Picker UI remains a host responsibility.

## Decision

`EgonClient` exposes synchronous `colorPicker.requested` and
`colorPicker.closed` events plus request-ID-based preview, confirm, and cancel
methods. A session-scoped coordinator captures exact selected element
references and IDs when the color button is clicked. It accepts responses only
while registry identity and selection membership still match that snapshot.
One request is active per client; selection/pad changes, element replacement or
deletion, unrelated commands including undo/redo, successful session promotion,
replacement by a newer request, and destruction permanently invalidate it.

A separate session-scoped preview-state service stores temporary colors by live
element reference. The renderer reads this override before persisted color for
every existing recolor path, including activity markers and annotation
connectors. The coordinator repaints with singular `element.changed` events;
preview state never writes business objects or commands. Confirmation first
retires the request and clears previews, then executes the existing
`element.colorChange` command once per selected element. Cancellation only
clears previews. Global picker events and unowned responses are removed.

## Alternatives considered

**Keep global events and add a client ID.** Rejected because a client ID alone
does not bind a response to one selection snapshot or prevent stale ID reuse
from reviving an old request.

**Write preview colors into the model and revert on cancel.** Rejected because
observers, exports, dirty tracking, and undo history would see provisional UI
state, and failures could strand it in the document.

**Put the picker UI in core.** Rejected because dialogs and host presentation
belong outside the host-independent modeling core. A future default picker can
be built as a consumer of the same public protocol.

## Consequences

- Multiple clients, even with identical element IDs, cannot consume each
  other's picker responses; stale requests return `false` without side effects.
- Preview is visually immediate and repeatable while exported data, story
  notifications, dirty state, and existing undo/redo history remain unchanged.
- Successful imports close the old request before committed-import public
  notifications; failed imports retain it. Picker subscriptions move with the
  promoted editor session.
- Hosts must retain the originating client and request ID across asynchronous or
  webview messaging, dismiss on `colorPicker.closed`, and close their own UI
  before client destruction because teardown emits no later host callbacks.
- The renderer gains a read-only dependency on session-local presentation
  state. This is an accepted exception to persisted-color-only rendering, not
  an exception to ADR 0016's ban on renderer writes.
