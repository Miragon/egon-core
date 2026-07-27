import { CommandContext } from "diagram-js/lib/command/CommandStack";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { Element, ElementLike } from "diagram-js/lib/model/Types";
import { DomainStoryTextRenderer } from "../../text-renderer/DomainStoryTextRenderer";
import { DomainStoryModeling } from "../../modeling/DomainStoryModeling";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { getLabel, getNumber, setLabel, setNumber } from "../utils";
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
        context.oldNumber = getNumber(context.element);
        return this.setText(
            context.element,
            context.newLabel,
            context.newNumber,
        );
    }

    revert(context: CommandContext): ElementLike[] {
        // Mirrors `execute`: restore only the half it actually wrote. Otherwise
        // undoing a pure label edit would stamp `oldNumber` — which `getNumber`
        // reports as `""` for an activity that has none — onto the model.
        return this.setText(
            context.element,
            context.newLabel === undefined ? undefined : context.oldLabel,
            context.newNumber === undefined ? undefined : context.oldNumber,
        );
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
     * Writes the label and/or the number, skipping whichever the caller left
     * undefined.
     *
     * WHY the skip (#74): `DomainStoryModeling` maps both `updateLabel` and
     * `updateNumber` onto this one command, and each supplies only its own half —
     * so writing both unconditionally made a label edit blank an activity's
     * number and a number edit blank its name. The number half used to be
     * invisible, because the repaint that followed re-minted the number in
     * `renderExternalNumber`; with drawing reduced to a read it is not, and
     * merely renaming an activity would drop it out of the sequence. (The name
     * half was already worked around by hand: `ActivityDirectionChangedHandler`
     * carries `context.name` across its own `updateNumber` call.)
     */
    private setText(element: Element, text?: string, textNumber?: string) {
        const label = element.label || element;
        const number = element["number"] || element;
        const labelTarget = element["labelTarget"] || element;
        const numberTarget = element["numberTarget"] || element;

        if (text !== undefined) {
            setLabel(label, text);
        }
        if (textNumber !== undefined) {
            setNumber(number, textNumber);
        }

        return [label, labelTarget, number, numberTarget];
    }
}
