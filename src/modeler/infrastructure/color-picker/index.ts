import CommandStackModule from "diagram-js/lib/command";
import SelectionModule from "diagram-js/lib/features/selection";

import { ColorPickerCoordinator } from "./ColorPickerCoordinator";
import { ColorPickerPreviewState } from "./ColorPickerPreviewState";

export default {
    __depends__: [CommandStackModule, SelectionModule],
    __init__: ["domainStoryColorPickerCoordinator"],
    domainStoryColorPickerCoordinator: ["type", ColorPickerCoordinator],
    domainStoryColorPickerPreviewState: ["type", ColorPickerPreviewState],
};
