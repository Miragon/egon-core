import { CommandContext } from "diagram-js/lib/command/CommandStack";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { Element, ElementLike } from "diagram-js/lib/model/Types";
import { DomainStoryTextRenderer } from "../../text-renderer/DomainStoryTextRenderer";
import { DomainStoryModeling } from "../../modeling/DomainStoryModeling";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { getLabel, setLabel } from "../utils";
import { getBusinessObject, is } from "../../../../shared/infrastructure/util";

const NULL_DIMENSIONS = {
    width: 0,
    height: 0,
};

export class DomainStoryUpdateLabelHandler implements CommandHandler {
    static $inject: string[] = ["modeling", "domainStoryTextRenderer"];

    constructor(
        private readonly modeling: DomainStoryModeling,
        private readonly domainStoryTextRenderer: DomainStoryTextRenderer,
    ) {}

    execute(context: CommandContext): ElementLike[] {
        context.oldLabel = getLabel(context.element);
        return this.setText(context.element, context.newLabel);
    }

    revert(context: CommandContext): ElementLike[] {
        return this.setText(context.element, context.oldLabel);
    }

    postExecute(context: CommandContext) {
        const element = context.element,
            label = element.label || element;

        let newBounds = context.newBounds;

        if (is(element, ElementTypes.TEXTANNOTATION)) {
            const bo = getBusinessObject(label);

            const text = bo.name || bo.text;

            if (!text) {
                return;
            }

            if (typeof newBounds === "undefined") {
                newBounds = this.domainStoryTextRenderer.getExternalLabelBounds(
                    label,
                    text,
                );
            }

            // `false` or `null` bounds disable the resize.
            if (newBounds) {
                this.modeling.resizeShape(label, newBounds, NULL_DIMENSIONS);
            }
        }
    }

    /**
     * Label-only; numbers are written by `activity.changed` and
     * `activity.directionChange`. Returns label and target so both redraw.
     */
    private setText(element: Element, text?: string) {
        const label = element.label || element;
        const labelTarget = element["labelTarget"] || element;

        if (text !== undefined) {
            setLabel(label, text);
        }

        return [label, labelTarget];
    }
}
