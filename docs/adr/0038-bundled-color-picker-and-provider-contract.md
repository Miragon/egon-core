# 0038 — Bundle a default color picker behind a provider contract

- Status: accepted
- Date: 2026-09-13

## Context

ADR 0026 made color requests client- and selection-scoped, but kept all picker presentation host-owned and exposed
request/closed events plus imperative preview, confirmation, and cancellation methods. A plain `EgonClient` therefore
showed a color action that did nothing. Every host also had to reimplement the same UI and coordinate a multi-call
protocol, while the intended packaged core needs a useful default without giving providers diagram services or mutable
elements.

The default must coexist with diagram-js's Preact UI, remain safe with multiple clients and atomic editor-session
replacement, and leave package consumers free of React dependencies and alias configuration.

## Decision

`EgonClientConfig.colorPicker` selects one of three modes: omission installs an anchored built-in picker, a
`ColorPickerProvider` replaces it, and `false`
removes color actions. A provider synchronously returns a handle containing one final `Promise<string | null>` and
`dispose()`. It receives copied IDs, initial color, request ID, browser-viewport anchor, and `AbortSignal`, but no model
or diagram services. The per-client controller validates hex/RGB/RGBA results and owns abort, exactly-once disposal,
error containment, and late-result rejection.

The controller uses ADR 0026's internal coordinator and lifecycle protocol; confirmation still runs one undoable color
command per target. Its former public events and response methods are removed. Passive preview state remains an internal
rendering mechanism, but providers return only a final result and built-in drafts remain local to the popover.

The built-in adapter uses `react-colorful` 5.8.1 with Preact 10.29.7. Vite bundles `react-colorful`, maps its React
import to a React-compatible adapter backed by `diagram-js/lib/ui`, maps React subpaths to Preact compatibility modules,
and keeps Preact external. Routing the adapter through diagram-js's UI barrel guarantees both widgets consume its exact
Preact runtime even when a package manager virtualizes two same-version Preact installations. Preact is a direct runtime
dependency; React is neither installed nor required from consumers. The package includes the bundled dependency's
license notice and validates this arrangement in an isolated archive consumer.

This decision supersedes ADR 0026's host-only presentation and public protocol decision. Its coordinator
guarantees—client identity, immutable target snapshot, request invalidation, passive rendering, and undoable
confirmation— remain in force.

## Alternatives considered

- **Keep the host event protocol and add a default listener** — rejected because host and default listeners could open
  two pickers or apply twice, and the imperative preview surface remained harder to own and cancel safely.
- **Bundle React as another runtime** — rejected because diagram-js already uses Preact and two component runtimes add
  weight, resolution risk, and package setup for consumers.
- **Keep color actions visible when disabled** — rejected because a knowingly inert action is misleading and
  inaccessible feedback.

## Consequences

- Plain clients have working, alpha-capable, keyboard-accessible recoloring; hosts opt into custom presentation with one
  final-result abstraction.
- Provider work is aborted and disposed before client ports are destroyed and on every coordinator invalidation. Failed
  imports intentionally keep it live.
- Draft dragging and invalid/cancelled input create no model commands; Apply preserves existing per-element command and
  undo/redo behavior.
- Custom integrations must migrate off the removed events and response methods. There is deliberately no document-event
  or public-protocol compatibility bridge.
- `react-colorful` becomes bundled implementation code and Preact becomes a runtime dependency. Vite aliases, TypeScript
  JSX settings, browser journeys, license notices, and archive-consumer assertions lock the integration.
