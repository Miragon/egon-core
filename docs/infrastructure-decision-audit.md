# Infrastructure decision audit

- Date: 2026-09-06
- Scope: issue #70's six named infrastructure areas
- Outcome: one pure geometry helper was moved to domain; the remaining policy
  candidates are recorded follow-up work, not changed here.

This audit classifies a conditional by what its branch _does_. Domain policy
decides what the notation means or permits. Pure geometry computes from values
without framework state. Framework translation adapts diagram-js/DOM lifecycle
and wire shapes. Presentation/type dispatch chooses rendering or UI behavior.
A conditional is not an architecture violation merely because it remains in
infrastructure.

Locations use function or event-handler names rather than line numbers so the
record survives mechanical edits.

## Context-pad provider

File: `src/modeler/infrastructure/context-pad/DomainStoryContextPadProvider.ts`

| Location / condition                                                                           | Classification                      | Rationale                                                                                                                      | Disposition                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `computeReplaceMenuPosition`: no open pad                                                      | Framework translation               | A live DOM lookup may have no framework pad to measure.                                                                        | Keep; DOM positioning belongs in infrastructure.                                                         |
| constructor `create.end`: primary modifier and open-pad checks                                 | Framework translation               | Interprets diagram-js gesture and context-pad lifecycle state.                                                                 | Keep.                                                                                                    |
| constructor `create.end`: replace entry exists                                                 | Framework translation               | Guards an optional provider entry before invoking its framework action.                                                        | Keep.                                                                                                    |
| `onPickedColor`: selection exists                                                              | Framework translation               | Correlates an asynchronous document event with instance-local UI state.                                                        | Keep.                                                                                                    |
| `getContextPadEntries`: work object / actor / group / activity / annotation / connection chain | Presentation/type dispatch          | Selects context-pad controls for the concrete visual element; it does not itself decide whether a modeling command is legal.   | Keep; command legality remains in rules. Review separately if menu availability becomes business policy. |
| `notifyColorPickerOfCurrentElementColor`: single selection versus array/none                   | Presentation/type dispatch          | Chooses whether a meaningful color can seed the picker.                                                                        | Keep.                                                                                                    |
| `notifyColorPickerOfCurrentElementColor`: alpha-hex conversion and black fallback              | Presentation                        | Normalizes the host color-picker representation and supplies a UI default.                                                     | Keep.                                                                                                    |
| `executeCommandStack`: array versus single/absent selection                                    | Framework translation/type dispatch | Expands a multi-selection into diagram-js commands and guards stale UI state.                                                  | Keep.                                                                                                    |
| `getColorChangeDescription`: old color has alpha                                               | Presentation                        | Preserves the color representation expected by the existing element.                                                           | Keep.                                                                                                    |
| `addDelete`: delete denied                                                                     | Framework translation               | Turns the rules service's answer into omission of a context-pad entry.                                                         | Keep.                                                                                                    |
| delete click: array versus single; group versus other elements                                 | Framework translation/type dispatch | Adapts diagram-js' multi-target callback and routes groups through their specialized command.                                  | Keep.                                                                                                    |
| `isDeleteAllowed`: array verdict versus scalar verdict, including whole-selection check        | Framework translation               | Interprets diagram-js' polymorphic `Rules.allowed` result.                                                                     | Keep.                                                                                                    |
| actor/work-object replace actions: measured pad position versus cursor fallback                | Presentation                        | Chooses popup coordinates from available DOM geometry.                                                                         | Keep.                                                                                                    |
| `changeDirection`: source is actor                                                             | Domain policy                       | Decides whether reversing an activity clears its number or generates one; this encodes activity-direction numbering semantics. | Policy candidate: extract behind a domain decision in follow-up work. No behavior change in #70.         |
| `appendAction`: title is string versus translation descriptor                                  | Presentation/type dispatch          | Adapts two UI call shapes into a localized title.                                                                              | Keep.                                                                                                    |

## Replacement menu and delegated option builder

Files:
`src/modeler/infrastructure/replace/DomainStoryReplaceMenuProvider.ts` and
`src/modeler/infrastructure/replace/DomainStoryReplaceOption.ts`.

| Location / condition                                                 | Classification             | Rationale                                                                                                                             | Disposition                                                       |
| -------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `getEntries`: actor versus work object                               | Presentation/type dispatch | Chooses the icon catalogue and menu builder for the displayed element family.                                                         | Keep as adapter dispatch.                                         |
| `createMenuEntry`: supplied action versus default replace action     | Framework translation      | Adapts an optional popup callback to diagram-js' menu-entry contract.                                                                 | Keep.                                                             |
| `actorReplaceOptions`: candidate type differs from current type      | Domain policy              | Determines replacement eligibility by excluding the element's current actor type; the menu provider delegates the real decision here. | Policy candidate: move eligibility into domain in follow-up work. |
| `workObjectReplaceOptions`: candidate type differs from current type | Domain policy              | Same replacement-eligibility decision for work objects.                                                                               | Policy candidate: move with the actor rule in follow-up work.     |

## Label-editing provider

File:
`src/modeler/infrastructure/labeling/DomainStoryLabelEditingProvider.ts`.

| Location / condition                                                   | Classification             | Rationale                                                                                    | Disposition                                                                     |
| ---------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `element.dblclick`: activity                                           | Presentation/type dispatch | Routes activities to the existing numbering popup rather than leaving an inline editor open. | Keep.                                                                           |
| follow-up canvas events / command-stack changes: direct editing active | Framework translation      | Completes or cancels only an active diagram-js editing session.                              | Keep.                                                                           |
| `create.end`: command cannot execute                                   | Framework translation      | Honors the framework create verdict.                                                         | Keep.                                                                           |
| `create.end`: paste interaction hint                                   | Framework translation      | Avoids treating diagram-js paste as an ordinary create gesture.                              | Keep.                                                                           |
| `create.end`: created element is not an activity                       | Presentation/type dispatch | Opens inline editing only for visual types served by that editor.                            | Keep; activity editing route is UI composition.                                 |
| `activate`: background element                                         | Domain policy              | Determines that a notation element has no editable label.                                    | Policy candidate for a future domain label-capability decision; unchanged here. |
| `activate`: label lookup returned `undefined`                          | Framework translation      | Stops when the label-field adapter reports no supported field.                               | Keep; the underlying field choice is audited in `utils.ts`.                     |
| `activate`: text annotation                                            | Presentation/type dispatch | Enables the resize affordance for the only resizable editing box.                            | Keep.                                                                           |
| `getEditingBBox`: external label versus element fallback               | Presentation/type dispatch | Chooses the visual target whose canvas bounds anchor the editor.                             | Keep.                                                                           |
| `getEditingBBox`: missing default font size                            | Presentation               | Supplies a defensive renderer-style fallback.                                                | Keep.                                                                           |
| `getEditingBBox`: group width exceeds minimum                          | Pure geometry/presentation | Clamps an edit box to a UI minimum.                                                          | Keep; this is view geometry, not notation policy.                               |
| `getEditingBBox`: group / actor-or-work-object / annotation branches   | Presentation/type dispatch | Computes CSS and bounds for distinct rendered label layouts.                                 | Keep.                                                                           |
| `update`: annotation                                                   | Pure geometry/presentation | Converts resized absolute edit-box bounds back to element-relative bounds.                   | Keep in the framework adapter.                                                  |

## Labeling utilities

File: `src/modeler/infrastructure/labeling/utils.ts`.

| Location / condition                                                                            | Classification                             | Rationale                                                                                       | Disposition                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| former `selectPartOfActivity`: horizontal angle, strict length threshold, and last-match update | Pure geometry                              | Selects a connection segment solely from coordinates and angles.                                | Moved with label positioning to `src/modeler/domain/labeling/position.ts`; typed with a local `Coordinate` alias selecting the waypoint's `x` and `y` fields. |
| `getLabelAttr`: actor/work object/activity/group → `name`; annotation → `text`; otherwise none  | Domain policy                              | Chooses which semantic field constitutes each notation element's label.                         | Policy candidate: expose a domain label-field decision in follow-up work.                                                                                     |
| `getLabel` / `setLabel`: business object versus element                                         | Framework translation                      | Unwraps diagram-js' canvas representation before reading or writing semantic data.              | Keep.                                                                                                                                                         |
| `getLabel`: supported attribute and empty-value fallback                                        | Framework translation                      | Converts the chosen field into the direct-editing provider's optional-string contract.          | Keep after policy extraction.                                                                                                                                 |
| `setLabel`: supported attribute                                                                 | Framework translation                      | Applies a field decision to diagram-js' semantic object.                                        | Keep after policy extraction.                                                                                                                                 |
| `approximateArialSize11TextWidthInPixel`: empty versus non-empty text                           | Pure geometry/presentation                 | Implements a renderer-specific font-width approximation.                                        | Keep in infrastructure because it is tied to Arial 11 presentation.                                                                                           |
| `createAutocompleteForEdit`: initial non-work-object guard                                      | Domain policy                              | Decides that autocomplete suggestions apply only to work objects, not actors or other elements. | Policy candidate: extract an autocomplete-capability decision in follow-up work.                                                                              |
| autocomplete input/keydown: repeated work-object guards                                         | Mixed: domain policy + framework lifecycle | Reasserts the same eligibility because diagram-js recycles the editing DOM node.                | Split in follow-up: domain decides eligibility; infrastructure keeps stale-handler guards.                                                                    |
| autocomplete input: missing/empty dictionary                                                    | Framework translation                      | Avoids building a DOM list without suggestion data.                                             | Keep.                                                                                                                                                         |
| autocomplete input: synchronize recycled `.value`                                               | Framework translation                      | Normalizes diagram-js' contenteditable node before filtering.                                   | Keep.                                                                                                                                                         |
| autocomplete filtering: empty prefix or matching unique name                                    | Presentation                               | Defines suggestion-list filtering and duplicate suppression.                                    | Keep unless product semantics for matching are introduced.                                                                                                    |
| keydown: ArrowDown / ArrowUp / unshifted Enter; focused item exists                             | Presentation/framework translation         | Maps DOM keyboard events to focus movement and commit behavior.                                 | Keep.                                                                                                                                                         |
| `clearOldAutocompleteList`: list exists and click target is outside editor/list                 | Framework lifecycle                        | Owns transient DOM cleanup.                                                                     | Keep.                                                                                                                                                         |
| `updateFocusOnAutocompleteList`: no items; focus above/below bounds                             | Presentation                               | Guards and wraps the highlighted DOM item.                                                      | Keep.                                                                                                                                                         |
| document click: list was removed                                                                | Framework lifecycle                        | Removes the now-stale input listener only when cleanup occurred.                                | Keep.                                                                                                                                                         |

## Label-editing preview

File:
`src/modeler/infrastructure/labeling/DomainStoryLabelEditingPreview.ts`.

| Location / condition                                                               | Classification             | Rationale                                                              | Disposition                                           |
| ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| activation target: external label versus element                                   | Presentation/type dispatch | Chooses the SVG node represented by the edit session.                  | Keep.                                                 |
| activation: text annotation                                                        | Presentation/type dispatch | Builds the temporary SVG bracket only for annotation editing.          | Keep.                                                 |
| activation marker: annotation/label target versus actor/work object/activity/group | Presentation/type dispatch | Hides either the whole temporary target or only its rendered label.    | Keep.                                                 |
| resize: text annotation; missing absolute height fallback                          | Presentation/SVG handling  | Recomputes preview path geometry and prevents a bad scale denominator. | Keep; SVG preview handling belongs in infrastructure. |
| complete/cancel: active provider exists                                            | Framework lifecycle        | Removes markers only when diagram-js supplies an active provider.      | Keep.                                                 |
| complete/cancel: preview SVG exists                                                | Framework lifecycle        | Removes an optional temporary node and clears instance state.          | Keep.                                                 |

## Paste restore

File: `src/modeler/infrastructure/copy-paste/DomainStoryPasteRestore.ts`.

| Location / condition                                            | Classification                      | Rationale                                                                                                | Disposition                                      |
| --------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `isPasteInteraction`: `createElementsBehavior === false`        | Framework translation               | Recognizes diagram-js' paste marker on a create interaction.                                             | Keep.                                            |
| cancel/rejected listener: interaction is a paste                | Framework lifecycle                 | Clears paste-only state without discarding a stash during an unrelated aborted drag.                     | Keep; paste lifecycle belongs in infrastructure. |
| `pasteElement`: descriptor is annotation; missing text fallback | Framework translation/type dispatch | Stashes the semantic field diagram-js fails to copy and normalizes absent text to the renderer contract. | Keep.                                            |
| `createEnd`: no color stash                                     | Framework lifecycle                 | Prevents ordinary palette creation from consuming paste state.                                           | Keep.                                            |
| `createEnd`: created element is annotation                      | Framework translation/type dispatch | Restores annotation text in FIFO order while all elements restore color by paste index.                  | Keep.                                            |

## Follow-up boundary

The policy candidates above are deliberately not extracted in this change.
Doing so would require explicit domain APIs and behavior-focused tests for
activity numbering, replacement eligibility, label fields, and autocomplete
eligibility. Transaction, containment, rendering, malformed-path handling, and
other unrelated fixes remain out of scope.
