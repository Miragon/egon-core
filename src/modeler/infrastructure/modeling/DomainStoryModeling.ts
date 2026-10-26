import Modeling, {
    ModelingHints,
} from "diagram-js/lib/features/modeling/Modeling";

import EventBus from "diagram-js/lib/core/EventBus";
import ElementFactory from "diagram-js/lib/core/ElementFactory";
import CommandStack from "diagram-js/lib/command/CommandStack";
import { Element, Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";

export class DomainStoryModeling extends Modeling {
    // No `domainStoryRules` token: `$inject` is positional and the constructor
    // takes three. The rules come in via `__depends__` and `__init__`.
    static override $inject: string[] = [
        "eventBus",
        "elementFactory",
        "commandStack",
    ];

    constructor(
        eventBus: EventBus,
        elementFactory: ElementFactory,
        private readonly commandStack: CommandStack,
    ) {
        super(eventBus, elementFactory, commandStack);
    }

    override replaceShape(
        oldShape: Shape,
        newData: Partial<Shape>,
        hints: ModelingHints,
    ): Shape {
        const context = {
            oldShape,
            newData,
            hints: hints || {},
        };

        this.commandStack.execute("shape.replace", context);

        // @ts-expect-error context will be altered
        return context.newShape;
    }

    updateLabel(element: Element, newLabel: string, newBounds?: Rect) {
        if (
            element.businessObject
                ? newLabel !== element.businessObject.name
                : newLabel !== element["name"]
        ) {
            this.commandStack.execute("element.updateLabel", {
                element: element,
                newLabel: newLabel,
                newBounds: newBounds,
            });
        }
    }

    /** Removes a group but keeps its contents, as a single undo entry. */
    removeGroup(element: Element) {
        this.commandStack.execute("shape.removeGroupWithoutChildren", {
            element: element,
        });
    }
}
