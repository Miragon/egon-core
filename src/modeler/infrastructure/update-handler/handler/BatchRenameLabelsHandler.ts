import type { CommandContext } from "diagram-js/lib/command/CommandStack";
import type { Element } from "diagram-js/lib/model/Types";

import type { ResolvedLabelRename } from "../../../../labelDictionary/domain/LabelDictionary";
import { DomainStoryModeling } from "../../modeling/DomainStoryModeling";

/** Groups existing label-update commands into one undo/redo action. */
export class BatchRenameLabelsHandler {
    static $inject: string[] = ["modeling"];

    constructor(private readonly modeling: DomainStoryModeling) {}

    preExecute(context: CommandContext): void {
        for (const update of context.updates as readonly ResolvedLabelRename[]) {
            this.modeling.updateLabel(
                update.element as unknown as Element,
                update.name,
            );
        }
    }

    execute(): never[] {
        return [];
    }

    revert(): never[] {
        return [];
    }
}
