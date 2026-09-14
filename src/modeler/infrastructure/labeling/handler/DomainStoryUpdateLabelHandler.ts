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

        // resize text annotation to the amount of text that is entered
        if (is(element, ElementTypes.TEXTANNOTATION)) {
            const bo = getBusinessObject(label);

            const text = bo.name || bo.text;

            // don't resize without text
            if (!text) {
                return;
            }

            // resize an element based on labeled _or_ pre-defined bounds
            if (typeof newBounds === "undefined") {
                // newBounds = this.domainStoryTextRenderer.getLayoutedBounds(label, text);
                newBounds = this.domainStoryTextRenderer.getExternalLabelBounds(
                    label,
                    text,
                );
            }

            // setting newBounds to false or _null_ will
            // disable the postExecute resize operation
            if (newBounds) {
                this.modeling.resizeShape(label, newBounds, NULL_DIMENSIONS);
            }
        }
    }

    /**
     * Writes the label onto the element's own label carrier and reports both it
     * and its target as changed, so an external label and the shape it belongs
     * to redraw together.
     *
     * This command is label-only (#84). It once wrote an activity's *number*
     * too, because `DomainStoryModeling` mapped `updateNumber` onto it as well —
     * and writing both halves unconditionally made a label edit blank the number
     * (#74). `updateNumber` is gone; `activity.changed` and
     * `activity.directionChange` own every number write now, so there is no
     * second half left to skip.
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
