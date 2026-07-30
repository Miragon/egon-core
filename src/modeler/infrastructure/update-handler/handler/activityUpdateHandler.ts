import { CommandContext } from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { Connection, Element, ElementLike } from "diagram-js/lib/model/Types";
import { ElementRegistryService } from "../../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../../story/domain/canvasObject";
import { restoredNumberAssignments } from "../../../../story/domain/activityNumbering";
import { isActor } from "../../../../story/domain/elementPredicates";
import { DomainStoryNumberingRegistry } from "../../popup/DomainStoryNumberingRegistry";

/**
 * The whole activity-edit transaction: label, number, multiple-number allowance
 * and the renumbering cascade the new number triggers.
 *
 * WHY it owns all of it: the popup used to mutate the business object before
 * executing this command and run the cascade after it, which left three of the
 * four steps outside the undo stack. `preExecute` therefore snapshotted an
 * already-edited model (undo restored the *new* number) and `redo` — which
 * re-runs `execute` only — re-applied the edit without the cascade, duplicating
 * numbers. The transaction boundary belongs to the command; the popup only
 * builds the context.
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

    /**
     * Snapshots only — this runs once and is *skipped on redo*, so every field
     * here must be a value read before any mutation. Nothing may be changed from
     * this phase or the redo path would diverge from the first execute.
     */
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
     * Applies the edit *and* the cascade it triggers. Three non-obvious
     * constraints:
     *
     * - This **is** the redo path (diagram-js re-runs `execute` alone), so
     *   anything the popup used to do after `commandStack.execute` has to happen
     *   here or redo re-applies half the edit.
     * - It may not touch the command stack: `CommandStack._atomicDo` is active
     *   during `execute`/`revert` and a nested action throws "illegal invocation".
     *   The cascade stays direct mutation plus `eventBus.fire`.
     * - The truthiness guard on `newNumber` is load-bearing: `PopupMenu` maps an
     *   empty number field to `0`, and cascading from `0` would walk the registry
     *   from its `[false]` sentinel slot and renumber everything.
     * - Clearing the number field of an actor-sourced activity **re-mints** one.
     *   That is not new behaviour: until #74 the repaint that followed this
     *   command found `number == null` and minted it in `renderExternalNumber`.
     *   Drawing is a read now, so the transaction that cleared the number has to
     *   be the one that replaces it, or the step would silently leave the
     *   sequence.
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

        // Computed *after* the clear above, so it reads a registry in which this
        // activity holds no number and cannot collide with itself. The write
        // belongs here, inside execute, so revert can put the old number back.
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

        // Fired last so the edited element redraws against the final state. Only
        // this element is returned: the cascaded ones already got their own
        // `element.changed` from the registry, and naming them here would double
        // the redraw.
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

        // Overlaps with the line above for an actor-sourced activity (the
        // snapshot contains it and re-assigns the same value). Harmless — and the
        // line above is what keeps a work-object-sourced activity, which never
        // appears in this snapshot, correct.
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
     * Snapshots only, so `revert` can put the pre-swap state back — `execute` is
     * the redo path and must not depend on anything this phase computed.
     *
     * `null`, not `0`, is "this activity has no number" (#74). The `0` this used
     * to normalize to was laundered away by the repaint that followed:
     * `renderExternalNumber` overwrote the number of every non-actor-sourced
     * activity with `null`. With drawing reduced to a read, that `0` would
     * survive into the exported file as `"number": 0` — a value no other writer
     * produces and no reader expects.
     */
    preExecute(context: CommandContext) {
        context.oldNumber = context.businessObject.number ?? null;
        context.oldWaypoints = context.element.waypoints;
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

        // See `preExecute`: the context pad passes `null` for "the swap makes a
        // work object the source", and nothing downstream normalizes it any more.
        businessObject.number = context.newNumber ?? null;
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
