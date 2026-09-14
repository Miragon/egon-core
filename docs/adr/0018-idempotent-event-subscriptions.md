# 0018 — Make event subscriptions idempotent per callback and event

- Status: accepted
- Date: 2026-09-05

## Context

`EgonClient.on(event, callback)` delegates to adapters that wrap host callbacks
before registering them on diagram-js' event bus. Story, viewport and icon
callbacks use debounced wrappers; import-repair callbacks use synchronous
wrappers that project internal objects to public ids.

Registering the same callback twice for one event previously allocated and
subscribed a second wrapper, then replaced the first wrapper in the adapter's
registry. Both wrappers remained live, but only the second could be found by
`off()` or teardown. A single internal event could therefore reach the host
twice, an armed debounce timer could become unreachable, and a callback could
fire after it had been removed or its client destroyed.

The public API did not define whether repeated registration counted references,
was rejected, or was idempotent. Hosts therefore could not know how many
`off()` calls were required.

## Decision

Treat callback identity plus event name as the subscription key. Registering the
same callback more than once for the same event is idempotent: duplicate `on()`
calls are ignored before a wrapper or subscription is allocated. One matching
`off()` fully removes the subscription and cancels any pending debounced
delivery. The callback may be registered again after removal.

Registrations of the same callback for different events remain independent.
The behavior applies consistently to `story.changed`, `viewport.changed`,
`icons.changed`, and `import.repaired`, and is documented on `EgonClient` and
the event methods of `ModelerPort` and `IconPort`.

## Alternatives considered

**Reference-count duplicate registrations.** Rejected: it makes accidental
duplicate setup observable and requires a host to balance every repeated
`on()` with another `off()`. That is fragile across component rerenders and
does not match the existing callback-keyed adapter registries.

**Throw on duplicate registration.** Rejected: it converts harmless repeated
setup into a runtime failure and would be an unnecessarily strict change for
existing hosts.

**Replace the existing wrapper on every registration.** Rejected: removing the
old event-bus subscription and cancelling its timer would discard an already
pending legitimate delivery. Keeping the old subscription while replacing only
the registry entry is the leak this decision fixes.

## Consequences

- Repeated setup cannot multiply delivery or create subscriptions that `off()`
  and `destroy()` can no longer reach.
- A duplicate registration during a debounce window preserves the original
  pending delivery.
- Hosts can call `off()` once without tracking how often setup attempted the
  same event/callback pair.
- Hosts that intentionally relied on duplicate delivery from one callback no
  longer receive it; they must register distinct callback functions instead.
- The adapters keep separate registries per event, so callback identity does not
  couple otherwise independent event subscriptions.
