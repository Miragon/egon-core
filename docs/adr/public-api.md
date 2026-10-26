# Public API

The contract hosts build on: what egon-core exports, how its events behave,
and how its operations treat the model.

## <a id="api-1"></a>API-1 — `EgonClient` plus types is the frozen public surface

- Status: accepted
- History: 2026-07-20 `EgonClient`, `EgonPlugin` and deprecated services
  exported (ADR 0002); 2026-07-22 frozen to `EgonClient` plus types (ADR 0010);
  2026-07-28 first widening, `import.repaired` (ADR 0017); 2026-09-15
  `egon-core/icons` entry (ADR 0039)
- Enforced by: architecture rule G; the demo's ESLint import restrictions
  ([TST-3](testing.md#tst-3))

**Context.** After the extraction the package also exported `EgonPlugin` (the
diagram-js module) and six service classes for "advanced integrations". No
host used them: the VS Code webview host imports only `EgonClient` and its
types. Keeping `EgonPlugin` public would have frozen the whole
`modeler/infrastructure` type surface, and the core still needs deep
refactors there.

**Decision.**

- `src/index.ts` is the main entry. It exports `EgonClient`, port and
  wire-format **types**, and the runtime values `DomainPurity`,
  `Granularity_Goal`, `Granularity_Grain`, and `PointInTime`. It exports
  nothing else: no `EgonPlugin` and no services.
- `egon-core/icons` (`src/icons.ts`) is a secondary, data-only entry that
  exports only `defaultIcons` ([ICO-5](icons.md#ico-5)). The main entry must
  not reach it.
- The `exports` and `files` fields in `package.json` are locked to these
  entries plus `style.css`
  ([REL-1](release-and-distribution.md#rel-1)).
- `EgonClient.create(config, additionalModules)` is the escape hatch for
  custom diagram-js modules. It does not make internal event names or model
  objects part of the contract.
- The barrel imports deep type paths, so it never pulls a feature's didi module
  into the package entry. Pulling one in would defeat lazy adapter loading.
- Widening is allowed only as a deliberate act: record a decision here and
  edit the frozen lists in `architecture.spec.ts`. The precedent is
  `import.repaired`: one named event and one type, added on a specifier that
  was already public. A new `EgonClient` method does not touch the frozen
  lists, but it still needs a decision when it creates a new host-facing
  contract.
- `EgonClient` has no test hooks. Tests use the same contract as hosts.

**Rejected alternatives.**

- **Keep `EgonPlugin` and the deprecated services exported:** no host used
  them, and keeping them would freeze the infrastructure types. Adding an
  export back later is non-breaking. Removing one is breaking.

**Consequences.**

- The API is small, and it changes only through review of a frozen list.
- Below 1.0, a breaking change is accepted when a decision justifies it, and
  it ships without a compatibility shim. Examples are the document shape
  ([DOC-1](documents.md#doc-1)), the icon registry methods
  ([ICO-3](icons.md#ico-3)), and the color-picker protocol
  ([EDT-2](editor-features.md#edt-2)). Release Please bumps the minor version
  for these ([REL-2](release-and-distribution.md#rel-2)).

## <a id="api-2"></a>API-2 — Host events are a closed, typed set with idempotent subscriptions

- Status: accepted
- History: 2026-07-28 `import.repaired` added (ADR 0017); 2026-09-05
  subscriptions made idempotent (ADR 0018) and unknown names rejected (ADR
  0019); 2026-09-11 `labels.changed` and `replay.changed` added (ADRs 0032, 0034)

**Context.** `EgonClient.on()` and `off()` delegate to adapters, which wrap
host callbacks before subscribing them on the diagram-js event bus. Two
problems followed:

- Registering one callback twice left two live wrappers, and only one could be
  removed. The result was duplicate deliveries, debounce timers nothing could
  reach, and callbacks that fired after `off()` or `destroy()`.
- An unknown event name did nothing, so a misspelled subscription looked
  successful.

**Decision.**

- The events are exactly `story.changed`, `viewport.changed`, `icons.changed`,
  `labels.changed`, `replay.changed`, and `import.repaired`, typed by
  `EgonEventMap`. `on()` and `off()` throw
  `TypeError("Unknown Egon event: …")` for any other name, so JavaScript hosts
  get the same protection as TypeScript hosts.
- A subscription is keyed by callback identity plus event name. Duplicate
  `on()` calls are ignored before anything is allocated. A single `off()`
  removes the subscription and cancels any pending debounced delivery. The
  same callback registered for different events counts as separate
  subscriptions.
- Payloads are detached public data, such as ids and snapshots. They never
  contain internal model objects.
- `import.repaired` is not debounced. An import fires it at most once, and the
  host must receive it before `import()` returns. Otherwise the host could
  offer a save that overwrites the original file.

**Rejected alternatives.**

- **Reference-count duplicate registrations:** hosts would have to balance
  every repeated `on()` across rerenders.
- **Throw on duplicate registration:** this turns harmless repeated setup into
  a failure.
- **Replace the wrapper on each registration:** this discards a legitimate
  delivery that is already pending.
- **Return a success flag for unknown names:** this changes the `void`
  contract, and callers can ignore the flag.
- **Accept arbitrary event names:** this widens the API and leaks
  infrastructure naming.

**Consequences.**

- Repeated setup cannot multiply deliveries, and one `off()` is always enough.
- A host that relied on getting duplicate deliveries from one callback must
  register separate functions.
- The runtime allowlist must stay aligned with `EgonEventMap`. Routing and
  rejection tests guard this.
- Event payloads are part of the compatibility surface. Adding a field is
  safe; renaming one is a breaking change.

## <a id="api-3"></a>API-3 — Operations are host-neutral and explicit about side effects

- Status: accepted
- History: 2026-07-23 no hidden alignment on export (ADR 0011); 2026-09-08
  export is read-only (ADR 0025); 2026-09-11 host-neutral export, label and
  replay primitives (ADRs 0030–0034)

**Context.** The documented save pattern is
`on("story.changed", () => export())`, so a hidden model write on a read path
would mark the document dirty again after every save. Hosts run in webviews
where `Blob` and download APIs differ, and they own their UI. UI or scheduling
inside the core would collide with the host's.

**Decision.**

- Reads never write. `export()`, `exportSVG()`, `exportPNG()`, and every
  `get*` call leave the model, undo history, and dirty state unchanged. They
  return detached snapshots.
- Model changes that the host asks for are explicit calls. Each runs as an
  undoable command and fires `story.changed`, for example `alignToOrigin()` and
  `renameLabels()`. The core never makes these changes implicitly.
- The core provides host-neutral building blocks and leaves presentation,
  scheduling, and persistence to hosts:
    - exports return bytes, not `Blob`s or downloads
    - replay controls are synchronous, and the host runs the timers
    - labels and icons come as snapshots, and the host builds the dialogs

    Hosts own drafts, filtering, and cancellation before a change is committed.

- Operations are synchronous where possible (`import()`, replay, label
  renames). Work that is asynchronous by nature, such as PNG rasterization,
  accepts an optional `AbortSignal`. The facade adapts the signal to a
  framework-free cancellation port. A document replacement or `destroy()` also
  cancels the work.
- The only UI the core ships is the color picker. It is a replaceable default
  behind a provider contract ([EDT-2](editor-features.md#edt-2)).

**Consequences.**

- Hosts can save on `story.changed` without loops. If they need alignment,
  they call it before saving or exporting instead of reacting to the event.
- Hosts write more glue code: timers for replay, dialogs for renames, and file
  handling for exports.
