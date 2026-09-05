# 0019 — Reject unknown public event names at runtime

- Status: accepted
- Date: 2026-09-05

## Context

`EgonClient.on()` and `off()` expose a closed, typed set of host events. The
TypeScript signatures catch misspelled and unsupported names for typed callers,
but JavaScript callers and deliberate type escapes can still pass any runtime
value. The facade's switches previously had no default branch, so an invalid
name silently did nothing and gave the host no indication that its subscription
was absent.

Silent failure is particularly hard to diagnose for event setup: the call
appears successful, no adapter is reached, and the defect becomes visible only
when an expected notification never arrives.

## Decision

Keep the existing closed `EgonEventName` and generic callback signatures, and
validate them at the `EgonClient` facade boundary. Both `on()` and `off()` throw
`TypeError` with `Unknown Egon event: ${String(event)}` when the event is not one
of `story.changed`, `viewport.changed`, `icons.changed`, or `import.repaired`.

Removing an unregistered callback for a valid event remains harmless, as does
idempotently registering an existing callback under ADR 0018.

## Alternatives considered

**Continue silently ignoring unknown names.** Rejected because it hides host
integration errors and makes unsupported names look like successful
subscriptions.

**Return a success flag.** Rejected because it would change the established
`void` method contract and callers could still ignore the result.

**Accept arbitrary string event names.** Rejected because it would widen the
frozen public API and leak infrastructure event naming through the facade.

## Consequences

- JavaScript hosts get an immediate, deterministic error for an invalid event
  name, matching the compile-time protection TypeScript hosts already receive.
- No adapter port is called for an invalid name.
- Existing hosts that relied on silent invalid-event handling now observe a
  thrown exception and must correct or explicitly handle it.
- The runtime allowlist must be kept aligned with `EgonEventMap`; unit routing
  coverage for every supported event and rejection tests for both methods guard
  that seam.
