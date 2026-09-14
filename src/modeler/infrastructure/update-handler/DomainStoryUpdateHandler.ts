import CommandStack from "diagram-js/lib/command/CommandStack";
import {
    ActivityChangedHandler,
    ActivityDirectionChangedHandler,
} from "./handler/activityUpdateHandler";
import {
    ElementColorChangeHandler,
    RemoveGroupWithoutChildrenHandler,
} from "./handler/elementUpdateHandler";
import { BatchRenameLabelsHandler } from "./handler/BatchRenameLabelsHandler";

export class DomainStoryUpdateHandler {
    static $inject: string[] = ["commandStack"];

    constructor(commandStack: CommandStack) {
        commandStack.registerHandler(
            "activity.changed",
            ActivityChangedHandler,
        );
        commandStack.registerHandler(
            "activity.directionChange",
            ActivityDirectionChangedHandler,
        );

        commandStack.registerHandler(
            "element.colorChange",
            ElementColorChangeHandler,
        );
        commandStack.registerHandler(
            "shape.removeGroupWithoutChildren",
            RemoveGroupWithoutChildrenHandler,
        );
        commandStack.registerHandler(
            "labels.renameBatch",
            BatchRenameLabelsHandler,
        );
    }
}
