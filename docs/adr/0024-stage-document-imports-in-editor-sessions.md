# 0024 — Stage document imports in isolated editor sessions

- Status: accepted
- Date: 2026-09-08

## Context

The importer previously cleared the active diagram before it loaded icons,
created shapes and connections, rendered the version banner, or stored metadata.
Any exception after that clear left the user with a partial replacement and also
destroyed the original live element objects and command-stack history. Restoring
an exported snapshot after failure would not be equivalent: it could not restore
object identity, undo/redo state, extension instances, pending notifications, or
the exact viewport and icon pool.

`EgonClient.import()` must remain synchronous and retain the historical repair
behavior and public events. diagram-js injectors own stateful modules, DOM,
listeners, command stacks, icon registries, and renderers as one lifecycle unit.

## Decision

An infrastructure `EditorSessionOwner` owns the active diagram-js session.
Import first normalizes, validates, and repairs untrusted data without changing
that session. It then constructs a complete candidate with the same configuration,
text renderer, and additional modules in a hidden measurable container. The
candidate has its own DOM, inactive icon stylesheet, injector, module instances,
and copied sanitized custom-icon pool. Explicit validated attributes, rather
than the imported record spread, are handed to diagram-js.

Only after icon preparation, materialization, metadata/banner setup, and viewport
restoration all succeed does a synchronous DOM/style/session swap promote the
candidate. Subscriptions move to the new event bus, obsolete pending deliveries
are cancelled, public icon/repair notifications are published, and the previous
session is destroyed. Pre-commit failure destroys only the candidate. Reentrant
imports are rejected. Architecture and browser tests enforce the transaction and
lifecycle boundaries.

## Alternatives considered

**Snapshot and restore the active editor.** Rejected because serialization does
not contain command history, live object identity, extension state, pending event
deliveries, or the complete custom-icon pool.

**Validate first, then continue importing into the active editor.** Rejected
because sanitizers, custom modules, renderers, palette rebuilds, DOM operations,
and element insertion can still throw after validation.

**Make import asynchronous.** Rejected because it changes the public contract
and is unnecessary: construction, materialization, and promotion are synchronous.

## Consequences

- Every failed import leaves the active editor and its pending subscriptions
  untouched; a successful import preserves the viewport and starts with clean,
  empty undo/redo history.
- Additional modules are session-scoped and may be constructed for unsuccessful
  attempts. They must clean up on `diagram.destroy`.
- Core can roll back session-owned effects only. External effects and mutable
  shared `value` providers used by extensions remain the extension's responsibility.
- A successful import temporarily holds two complete editor sessions, increasing
  peak memory and construction work. This lifecycle cost is accepted in exchange
  for true failure atomicity.
- Host observer and old-session cleanup errors occur after commit and are reported
  through browser error reporting (with a console fallback); they do not make a
  successful import appear to have failed.
