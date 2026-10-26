import { CommandContext } from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { Connection, Element, ElementLike } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";
import { ElementRegistryService } from "../../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../../story/domain/canvasObject";
import { restoredNumberAssignments } from "../../../../story/domain/activityNumbering";
import { isActor } from "../../../../story/domain/elementPredicates";
import { DomainStoryNumberingRegistry } from "../../popup/DomainStoryNumberingRegistry";

/**
 * The whole activity-edit transaction: label, number, multiple-number allowance
 * and the renumbering cascade. All of it lives here so undo and redo cover every
 * step; the popup only builds the context.
 */
export class ActivityChangedHandler implements CommandHandler {
    static $inject: string[] = [
        "domainStoryElementRegistryService",
        "eventBus",
        "domainStoryNumberingRegistry",
    ];

    constructor(
        private readonly elementRegistryService: ElementRegistryService,
        private readonly eventBus: EventBus,
        private readonly numberingRegistry: DomainStoryNumberingRegistry,
    ) {}

    /** Snapshots only: skipped on redo, so a mutation here breaks redo. */
    preExecute(context: CommandContext) {
        context.oldLabel = context.businessObject.name;
        context.oldNumber = context.businessObject.number;
        context.oldMultipleNumberAllowed =
            context.businessObject.multipleNumberAllowed;
        context.oldNumbersWithIDs = this.numberingRegistry.getNumbersAndIDs();
        context.oldMultipleNumberRegistry =
            this.numberingRegistry.snapshotMultipleNumberRegistry();
    }

    /**
     * Also the redo path (diagram-js re-runs `execute` alone), so the cascade must
     * run here. It may not use the command stack: `CommandStack._atomicDo` throws
     * "illegal invocation" on nested actions.
     *
     * The truthiness guard on `newNumber` matters: `PopupMenu` maps an empty field
     * to `0`, and cascading from `0` would renumber everything from the registry's
     * `[false]` sentinel slot. Clearing an actor-sourced activity's number mints a
     * new one so the step stays in the sequence.
     */
    execute(context: CommandContext): ElementLike[] {
        const businessObject = context.businessObject;
        const element: Element = context.element;

        // Read pre-mutation: the cascade must see the numbers it has to move.
        const activities =
            this.elementRegistryService.getActivitiesFromActors();

        businessObject.name = context.newLabel;
        // `null`, never `undefined`: `JSON.stringify` drops `undefined`, and every
        // fixture persists `"number": null` for an unnumbered activity.
        businessObject.number = context.newNumber ?? null;
        businessObject.multipleNumberAllowed =
            context.newMultipleNumberAllowed ?? false;

        // After the clear above, so the new number cannot collide with this
        // activity's old one.
        if (!context.newNumber && isActor(element["source"])) {
            businessObject.number =
                this.numberingRegistry.generateAutomaticNumber();
        }

        if (context.newNumber) {
            this.numberingRegistry.updateExistingNumbersAtEditing(activities, {
                id: businessObject.id,
                number: context.newNumber,
                multipleAllowed: businessObject.multipleNumberAllowed,
            });
        }

        // Only this element: the registry already fired `element.changed` for the
        // cascaded ones, and returning them would redraw them twice.
        this.eventBus.fire("element.changed", { element });

        return [element];
    }

    revert(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element = context.element;
        semantic.name = context.oldLabel;
        semantic.number = context.oldNumber;
        semantic.multipleNumberAllowed = context.oldMultipleNumberAllowed;

        this.numberingRegistry.restoreMultipleNumberRegistry(
            context.oldMultipleNumberRegistry,
        );

        // Re-assigns an actor-sourced activity's number again. Harmless; the line
        // above covers work-object-sourced ones, which the snapshot lacks.
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
    static $inject: string[] = ["eventBus"];

    constructor(private readonly eventBus: EventBus) {}

    /**
     * Snapshots only: skipped on redo. `null`, not `0`, means "no number"; a `0`
     * would be exported as `"number": 0`, which no reader expects.
     */
    preExecute(context: CommandContext) {
        context.oldNumber = context.businessObject.number ?? null;
        context.oldWaypoints = context.element.waypoints;
    }

    execute(context: CommandContext): ElementLike[] {
        const businessObject = context.businessObject;
        const element: Connection = context.element;
        const swapSource = element.source;
        const waypoints = element.waypoints;
        // Copy, never reverse in place: imported connections can alias
        // `element.waypoints` and `businessObject.waypoints`.
        const newWaypoints = [...waypoints].reverse();

        element.source = element.target;
        businessObject.source = businessObject.target;
        element.target = swapSource;
        businessObject.target = swapSource?.id;

        // `null` when the swap makes a work object the source.
        businessObject.number = context.newNumber ?? null;
        element.waypoints = newWaypoints;
        businessObject.waypoints = copyWaypoints(newWaypoints);

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

        semantic.number = context.oldNumber;
        element.waypoints = context.oldWaypoints;
        semantic.waypoints = copyWaypoints(context.oldWaypoints);

        this.eventBus.fire("element.changed", { element });

        return [element];
    }
}

/**
 * Deep-copies waypoints, including the `original` docking anchor that diagram-js
 * leaves off its `Point` type, so persisted geometry never aliases the live one.
 */
function copyWaypoints(waypoints: readonly Point[]): Point[] {
    return waypoints.map((point) => {
        const original = (point as Point & { original?: Point }).original;

        if (original) {
            return {
                x: point.x,
                y: point.y,
                original: {
                    x: original.x,
                    y: original.y,
                },
            } as Point;
        }

        return {
            x: point.x,
            y: point.y,
        };
    });
}

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
