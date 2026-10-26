import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import SelectionModule from "diagram-js/lib/features/selection";
import SpaceToolModule from "diagram-js/lib/features/space-tool";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import DirectEditingModule from "diagram-js-direct-editing";

import DomainStoryModeling from "../modeling";
import { DomainStoryEditorActions } from "./DomainStoryEditorActions";

export default {
    // One entry per `DomainStoryEditorActions.$inject` token not in diagram-js
    // core. `DomainStoryModeling` is for `SpaceTool`, which injects `modeling`
    // but leaves it to the host.
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
