# 0032 — Headless replay with domain traversal

- Status: accepted
- Date: 2026-09-11

## Context

Upstream replay mixes Angular signals, snackbars, timers, and document-wide DOM
queries with story traversal. The standalone core needs deterministic replay
semantics without taking ownership of playback controls or scheduling, and two
clients on one page must not affect each other.

## Decision

Pure `story/domain` traversal groups actor-originating activities by numeric
sequence number, sorts those groups numerically, and traces downstream through
work objects with visited-id guards while stopping at actors. Steps reveal
cumulatively and include attached annotations. Groups are a separate optional
presentation set, off by default.

The modeler infrastructure owns one replay controller per editor session. It
uses diagram-js markers and the instance's registry/canvas to hide, reveal, and
highlight elements, including label graphics. Public controls start, stop,
navigate, seek, and toggle groups synchronously; `replay.changed` publishes
detached state. Starting closes transient editing, selection/context-pad, and
color-picker UI. Any command/history change, successful import, or destruction
stops replay without changing model geometry or history.

## Alternatives considered

- **Port upstream timers and controls** — rejected because scheduling and UI are
  host concerns.
- **Use global DOM selectors** — rejected because overlapping element IDs across
  clients would break multi-instance isolation.

## Consequences

- Sequence gaps remain playable and equal numbers form parallel steps.
- Cyclic malformed graphs terminate safely.
- Hosts own timers and must stop them when replay becomes inactive.
