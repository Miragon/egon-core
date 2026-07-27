import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import KeyboardBindingsModule from "diagram-js/lib/features/keyboard";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import KeyboardMoveModule from "diagram-js/lib/navigation/keyboard-move";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import MoveModule from "diagram-js/lib/features/move";
import BendpointsModule from "diagram-js/lib/features/bendpoints";
import ConnectionPreviewModule from "diagram-js/lib/features/connection-preview";
import SnappingModule from "diagram-js/lib/features/snapping";
import AlignToOrigin from "@bpmn-io/align-to-origin";

import DomainStoryElementFactory from "./element-factory";
import DomainStoryRenderer from "./renderer";
import DomainStoryModeling from "./modeling";
import DomainStoryUpdater from "./updater";
import DomainStoryPaletteProvider from "./palette";
import DomainStoryContextPadProvider from "./context-pad";
import DomainStoryLabelEditing from "./labeling";
import DomainStoryUpdateHandler from "./update-handler";
import DomainStoryCopyPaste from "./copy-paste";
import DomainStoryKeyboardBindings from "./keyboard";
import DomainStoryPopupService from "./popup";
import DomainStoryDirtyFlag from "./dirty-flag";
import { StoryExportModule, StoryImportModule } from "../../story/service";

const buildInModules = [
    EditorActionsModule,
    KeyboardBindingsModule,
    MoveCanvasModule,
    KeyboardMoveModule,
    ZoomScrollModule,
    MoveModule,
    BendpointsModule,
    ConnectionPreviewModule,
    SnappingModule,
    AlignToOrigin,
];

const domainStoryModules = [
    DomainStoryElementFactory,
    DomainStoryRenderer,
    DomainStoryModeling,
    DomainStoryUpdater,
    DomainStoryUpdateHandler,
    DomainStoryPaletteProvider,
    DomainStoryContextPadProvider,
    DomainStoryLabelEditing,
    DomainStoryCopyPaste,
    DomainStoryKeyboardBindings,
    DomainStoryPopupService,
    DomainStoryDirtyFlag,
    StoryExportModule,
    StoryImportModule,
];

export default {
    __depends__: [...domainStoryModules, ...buildInModules],
};
