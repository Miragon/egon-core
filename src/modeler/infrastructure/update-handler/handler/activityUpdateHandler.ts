import { CommandContext } from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { Connection, Element, ElementLike } from "diagram-js/lib/model/Types";
import { ElementRegistryService } from "../../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../../story/domain/canvasObject";
import { restoredNumberAssignments } from "../../../../story/domain/activityNumbering";
import { DomainStoryModeling } from "../../modeling/DomainStoryModeling";
import { DomainStoryNumberingRegistry } from "../../popup/DomainStoryNumberingRegistry";

export class ActivityChangedHandler implements CommandHandler {
    static $inject: string[] = [
        "modeling",
        "domainStoryElementRegistryService",
        "eventBus",
        "domainStoryNumberingRegistry",
    ];

    constructor(
        private readonly modeling: DomainStoryModeling,
        private readonly elementRegistryService: ElementRegistryService,
        private readonly eventBus: EventBus,
        private readonly numberingRegistry: DomainStoryNumberingRegistry,
    ) {}

    preExecute(context: CommandContext) {
        context.oldLabel = context.businessObject.name || " ";

        const oldNumbersWithIDs = this.numberingRegistry.getNumbersAndIDs();
        this.modeling.updateLabel(context.businessObject, context.newLabel);
        this.modeling.updateNumber(context.businessObject, context.newNumber);

        context.oldNumber = context.businessObject.number;
        context.oldNumbersWithIDs = oldNumbersWithIDs;
    }

    execute(context: CommandContext): ElementLike[] {
        const businessObject = context.businessObject;
        const element: Element = context.element;

        if (context.newLabel && context.newLabel.length < 1) {
            context.newLabel = " ";
        }

        businessObject.name = context.newLabel;
        businessObject.number = context.newNumber;

        this.eventBus.fire("element.changed", { element });

        return [element];
    }

    revert(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element = context.element;
        semantic.name = context.oldLabel;
        semantic.number = context.oldNumber;

        revertAutomaticNumberGenerationChange(
            context.oldNumbersWithIDs,
            this.elementRegistryService.getActivitiesFromActors(),
            this.eventBus,
        );

        this.eventBus.fire("element.changed", { element });

        return [element];
    }
}

export class ActivityDirectionChangedHandler implements CommandHandler {
    static $inject: string[] = ["modeling", "eventBus"];

    constructor(
        private readonly modeling: DomainStoryModeling,
        private readonly eventBus: EventBus,
    ) {}

    preExecute(context: CommandContext) {
        context.oldNumber = context.businessObject.number;
        context.oldWaypoints = context.element.waypoints;
        context.name = context.businessObject.name;

        if (!context.oldNumber) {
            context.oldNumber = 0;
        }
        this.modeling.updateNumber(context.businessObject, context.newNumber);
    }

    execute(context: CommandContext): ElementLike[] {
        const businessObject = context.businessObject;
        const element: Connection = context.element;
        const swapSource = element.source;
        const newWaypoints = [];
        const waypoints = element.waypoints;

        for (let i = waypoints.length - 1; i >= 0; i--) {
            newWaypoints.push(waypoints[i]);
        }

        element.source = element.target;
        businessObject.source = businessObject.target;
        element.target = swapSource;
        businessObject.target = swapSource?.id;

        businessObject.name = context.name;
        businessObject.number = context.newNumber;
        element.waypoints = newWaypoints;

        this.eventBus.fire("element.changed", { element });

        return [element];
    }

    revert(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element: Connection = context.element;
        const swapSource = element.source;

        element.source = element.target;
        semantic.source = semantic.target;
        element.target = swapSource;
        semantic.target = swapSource?.id;

        semantic.name = context.name;

        semantic.number = context.oldNumber;
        element.waypoints = context.oldWaypoints;

        this.eventBus.fire("element.changed", { element });

        return [element];
    }
}

// reverts the automatic changes done by the automatic number-generation at editing
function revertAutomaticNumberGenerationChange(
    iDWithNumber: { id: string; number?: number }[],
    activities: ActivityCanvasObject[],
    eventBus: EventBus,
) {
    const activitiesById = new Map(
        activities.map((activity) => [activity.businessObject.id, activity]),
    );

    restoredNumberAssignments(
        iDWithNumber,
        activities.map((activity) => activity.businessObject.id),
    ).forEach(({ id, number }) => {
        const element = activitiesById.get(id);
        if (!element) {
            return;
        }
        element.businessObject.number = number;
        eventBus.fire("element.changed", { element });
    });
}
