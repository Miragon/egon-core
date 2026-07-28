import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import SelectionModule from "diagram-js/lib/features/selection";
import SpaceToolModule from "diagram-js/lib/features/space-tool";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import DirectEditingModule from "diagram-js-direct-editing";

import DomainStoryModeling from "../modeling";
import { DomainStoryEditorActions } from "./DomainStoryEditorActions";

export default {
    // One entry per token in `DomainStoryEditorActions.$inject`, except
    // `canvas`/`elementRegistry`, which diagram-js' core always provides. Without
    // them this module only resolved because `plugin.ts` happened to list the
    // same features; a host composing it alone got a didi "No provider" throw.
    //
    // `DomainStoryModeling` is here for `SpaceTool`, not for the actions class:
    // diagram-js' space-tool injects `modeling` but leaves it to the host to
    // provide, so the module that pulls space-tool in has to supply it.
    __depends__: [
        EditorActionsModule,
        SelectionModule,
        SpaceToolModule,
        LassoToolModule,
        HandToolModule,
        DirectEditingModule,
        DomainStoryModeling,
    ],
    __init__: ["domainStoryEditorActions"],
    domainStoryEditorActions: ["type", DomainStoryEditorActions],
};
