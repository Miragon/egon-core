# 0030 — Batch label renames through one parent command

- Status: accepted
- Date: 2026-09-11

## Context

The extracted label dictionary retained dialog-oriented cached state and no
working rename path. Hosts need a detached current snapshot and atomic bulk
rename semantics, including swaps, chains, undo, and existing label layout.

## Decision

`getLabelDictionary` derives and detaches activity and work-object entries on
every call. Exact label text is the deduplication key; display order is
case-insensitive. Work-object artwork is optional, so missing retained artwork
does not hide an editable label.

`renameLabels` validates category/original-name mappings and resolves every
matching live element before mutation. A `labels.renameBatch` parent command
invokes the existing `element.updateLabel` command for each resolved element in
`preExecute`, producing one undo/redo action while retaining established label
layout and activity-number behavior. `labels.changed` publishes refreshed
snapshots after effective command/history changes and every successful import.

## Alternatives considered

- **Run one top-level command per replacement** — rejected because one host
  action would require several undo operations.
- **Rename while scanning** — rejected because swaps and chains would process
  an element more than once.

## Consequences

- Conflicts reject before mutation; unchanged and unmatched mappings create no
  history.
- Empty replacement strings intentionally clear labels.
- Hosts own dialog state, drafts, filtering, and cancellation before commit.
