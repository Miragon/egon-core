# Infrastructure decision audit

- Date: 2026-09-13
- Scope: issue #70's six named infrastructure areas
- Outcome: the pure geometry helper and four deferred notation-policy slices
  now live in domain; remaining adapter branches are classified below.

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

| Location / condition                                                                           | Classification                      | Rationale                                                                                                                    | Disposition                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `computeReplaceMenuPosition`: no open pad                                                      | Framework translation               | A live DOM lookup may have no framework pad to measure.                                                                      | Keep; DOM positioning belongs in infrastructure.                                                         |
| constructor `create.end`: primary modifier and open-pad checks                                 | Framework translation               | Interprets diagram-js gesture and context-pad lifecycle state.                                                               | Keep.                                                                                                    |
| constructor `create.end`: replace entry exists                                                 | Framework translation               | Guards an optional provider entry before invoking its framework action.                                                      | Keep.                                                                                                    |
| `onPickedColor`: selection exists                                                              | Framework translation               | Correlates an asynchronous document event with instance-local UI state.                                                      | Keep.                                                                                                    |
| `getContextPadEntries`: work object / actor / group / activity / annotation / connection chain | Presentation/type dispatch          | Selects context-pad controls for the concrete visual element; it does not itself decide whether a modeling command is legal. | Keep; command legality remains in rules. Review separately if menu availability becomes business policy. |
| `notifyColorPickerOfCurrentElementColor`: single selection versus array/none                   | Presentation/type dispatch          | Chooses whether a meaningful color can seed the picker.                                                                      | Keep.                                                                                                    |
| `notifyColorPickerOfCurrentElementColor`: alpha-hex conversion and black fallback              | Presentation                        | Normalizes the host color-picker representation and supplies a UI default.                                                   | Keep.                                                                                                    |
| `executeCommandStack`: array versus single/absent selection                                    | Framework translation/type dispatch | Expands a multi-selection into diagram-js commands and guards stale UI state.                                                | Keep.                                                                                                    |
| `getColorChangeDescription`: old color has alpha                                               | Presentation                        | Preserves the color representation expected by the existing element.                                                         | Keep.                                                                                                    |
| `addDelete`: delete denied                                                                     | Framework translation               | Turns the rules service's answer into omission of a context-pad entry.                                                       | Keep.                                                                                                    |
| delete click: array versus single; group versus other elements                                 | Framework translation/type dispatch | Adapts diagram-js' multi-target callback and routes groups through their specialized command.                                | Keep.                                                                                                    |
| `isDeleteAllowed`: array verdict versus scalar verdict, including whole-selection check        | Framework translation               | Interprets diagram-js' polymorphic `Rules.allowed` result.                                                                   | Keep.                                                                                                    |
| actor/work-object replace actions: measured pad position versus cursor fallback                | Presentation                        | Chooses popup coordinates from available DOM geometry.                                                                       | Keep.                                                                                                    |
| `changeDirection`: `"clear"` versus `"generate"` decision                                      | Framework translation               | Translates `numberingOnDirectionChange` into `null` or a numbering-registry query before executing the existing command.     | Keep; direction-numbering policy is now in `story/domain/activityNumbering.ts`.                          |
| `appendAction`: title is string versus translation descriptor                                  | Presentation/type dispatch          | Adapts two UI call shapes into a localized title.                                                                            | Keep.                                                                                                    |

## Replacement menu and delegated option builder

Files:
`src/modeler/infrastructure/replace/DomainStoryReplaceMenuProvider.ts` and
`src/modeler/infrastructure/replace/DomainStoryReplaceOption.ts`.

| Location / condition                                             | Classification             | Rationale                                                                                     | Disposition                                                                  |
| ---------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getEntries`: actor versus work object                           | Presentation/type dispatch | Chooses the icon catalogue and menu builder for the displayed element family.                 | Keep as adapter dispatch.                                                    |
| `createMenuEntry`: supplied action versus default replace action | Framework translation      | Adapts an optional popup callback to diagram-js' menu-entry contract.                         | Keep.                                                                        |
| `actorReplaceOptions`: eligible candidate                        | Framework translation      | Builds actor menu metadata only when `isReplacementEligible` accepts the catalogue candidate. | Keep; exact-match eligibility is now in `story/domain/replacementPolicy.ts`. |
| `workObjectReplaceOptions`: eligible candidate                   | Framework translation      | Builds work-object menu metadata only when the same domain decision accepts the candidate.    | Keep; catalogue order and presentation metadata remain adapter work.         |

## Label-editing provider

File:
`src/modeler/infrastructure/labeling/DomainStoryLabelEditingProvider.ts`.

| Location / condition                                                   | Classification             | Rationale                                                                                               | Disposition                                                                              |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `element.dblclick`: activity                                           | Presentation/type dispatch | Routes activities to the existing numbering popup rather than leaving an inline editor open.            | Keep.                                                                                    |
| follow-up canvas events / command-stack changes: direct editing active | Framework translation      | Completes or cancels only an active diagram-js editing session.                                         | Keep.                                                                                    |
| `create.end`: command cannot execute                                   | Framework translation      | Honors the framework create verdict.                                                                    | Keep.                                                                                    |
| `create.end`: paste interaction hint                                   | Framework translation      | Avoids treating diagram-js paste as an ordinary create gesture.                                         | Keep.                                                                                    |
| `create.end`: created element is not an activity                       | Presentation/type dispatch | Opens inline editing only for visual types served by that editor.                                       | Keep; activity editing route is UI composition.                                          |
| `activate`: label editing is ineligible                                | Framework translation      | Stops activation when `canEditLabel` rejects the separate canvas identity and resolved semantic object. | Keep; background and semantic capability policy is now in `story/domain/labelPolicy.ts`. |
| `activate`: label lookup returned `undefined`                          | Framework translation      | Stops when the label-field adapter reports no supported field.                                          | Keep; the underlying field choice is audited in `utils.ts`.                              |
| `activate`: text annotation                                            | Presentation/type dispatch | Enables the resize affordance for the only resizable editing box.                                       | Keep.                                                                                    |
| `getEditingBBox`: external label versus element fallback               | Presentation/type dispatch | Chooses the visual target whose canvas bounds anchor the editor.                                        | Keep.                                                                                    |
| `getEditingBBox`: missing default font size                            | Presentation               | Supplies a defensive renderer-style fallback.                                                           | Keep.                                                                                    |
| `getEditingBBox`: group width exceeds minimum                          | Pure geometry/presentation | Clamps an edit box to a UI minimum.                                                                     | Keep; this is view geometry, not notation policy.                                        |
| `getEditingBBox`: group / actor-or-work-object / annotation branches   | Presentation/type dispatch | Computes CSS and bounds for distinct rendered label layouts.                                            | Keep.                                                                                    |
| `update`: annotation                                                   | Pure geometry/presentation | Converts resized absolute edit-box bounds back to element-relative bounds.                              | Keep in the framework adapter.                                                           |

## Labeling utilities

File: `src/modeler/infrastructure/labeling/utils.ts`.

| Location / condition                                                                            | Classification                     | Rationale                                                                                                             | Disposition                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| former `selectPartOfActivity`: horizontal angle, strict length threshold, and last-match update | Pure geometry                      | Selects a connection segment solely from coordinates and angles.                                                      | Moved with label positioning to `src/modeler/domain/labeling/position.ts`; typed with a local `Coordinate` alias selecting the waypoint's `x` and `y` fields. |
| `semanticLabelField`: supported field versus none                                               | Framework translation              | Reads the domain-selected `name`/`text` field or translates no field into the editor's existing unsupported behavior. | Keep; field selection is now in `story/domain/labelPolicy.ts`.                                                                                                |
| `getLabel` / `setLabel`: business object versus element                                         | Framework translation              | Unwraps diagram-js' canvas representation before reading or writing semantic data.                                    | Keep.                                                                                                                                                         |
| `getLabel`: supported attribute and empty-value fallback                                        | Framework translation              | Converts the chosen field into the direct-editing provider's optional-string contract.                                | Keep after policy extraction.                                                                                                                                 |
| `setLabel`: supported attribute                                                                 | Framework translation              | Applies a field decision to diagram-js' semantic object.                                                              | Keep after policy extraction.                                                                                                                                 |
| `approximateArialSize11TextWidthInPixel`: empty versus non-empty text                           | Pure geometry/presentation         | Implements a renderer-specific font-width approximation.                                                              | Keep in infrastructure because it is tied to Arial 11 presentation.                                                                                           |
| `createAutocompleteForEdit`: initial ineligible-element guard                                   | Framework translation              | Stops after teardown when `canAutocompleteLabel` rejects the semantic type.                                           | Keep; work-object-only eligibility is now in `story/domain/labelPolicy.ts`.                                                                                   |
| autocomplete input/keydown: repeated eligibility guards                                         | Framework lifecycle                | Reasserts the domain decision because diagram-js recycles the editing DOM node.                                       | Keep; repeated stale-handler protection belongs to the adapter.                                                                                               |
| autocomplete input: missing/empty dictionary                                                    | Framework translation              | Avoids building a DOM list without suggestion data.                                                                   | Keep.                                                                                                                                                         |
| autocomplete input: synchronize recycled `.value`                                               | Framework translation              | Normalizes diagram-js' contenteditable node before filtering.                                                         | Keep.                                                                                                                                                         |
| autocomplete filtering: empty prefix or matching unique name                                    | Presentation                       | Defines suggestion-list filtering and duplicate suppression.                                                          | Keep unless product semantics for matching are introduced.                                                                                                    |
| keydown: ArrowDown / ArrowUp / unshifted Enter; focused item exists                             | Presentation/framework translation | Maps DOM keyboard events to focus movement and commit behavior.                                                       | Keep.                                                                                                                                                         |
| `clearOldAutocompleteList`: list exists and click target is outside editor/list                 | Framework lifecycle                | Owns transient DOM cleanup.                                                                                           | Keep.                                                                                                                                                         |
| `updateFocusOnAutocompleteList`: no items; focus above/below bounds                             | Presentation                       | Guards and wraps the highlighted DOM item.                                                                            | Keep.                                                                                                                                                         |
| document click: list was removed                                                                | Framework lifecycle                | Removes the now-stale input listener only when cleanup occurred.                                                      | Keep.                                                                                                                                                         |

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

## Remaining boundary

Activity direction numbering, replacement eligibility, semantic label fields,
label-editing capability, and autocomplete eligibility are now exposed as pure
domain decisions. Transaction, catalogue lookup, UI presentation, framework
lifecycle, rendering, containment, and malformed-path handling remain adapter
concerns; unrelated correctness changes remain out of scope.
