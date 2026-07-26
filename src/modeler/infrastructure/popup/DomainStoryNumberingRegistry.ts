import EventBus from "diagram-js/lib/core/EventBus";
import { Element } from "diagram-js/lib/model/Types";

import { ElementRegistryService } from "../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../story/domain/canvasObject";
import { ActivityBusinessObject } from "../../../story/domain/activityBusinessObject";
import {
    ActivityNumberEdit,
    nextAvailableActivityNumber,
    renumberOnNumberEdit,
} from "../../../story/domain/activityNumbering";

/**
 * Applies the pure activity-numbering policy (`story/domain/activityNumbering`)
 * to the live canvas: it owns the mutable multiple-number registry (mutable
 * state must live on a didi-instantiated class, ADR 0012) and translates
 * computed number assignments into business-object mutations plus
 * `element.changed` events. The arithmetic itself is domain code — this class
 * only wires it to diagram-js.
 */
export class DomainStoryNumberingRegistry {
    static $inject: string[] = [
        "eventBus",
        "domainStoryElementRegistryService",
    ];

    /**
     * Specifies whether the index may occur multiple times.
     */
    private multipleNumberRegistry = [false];

    constructor(
        private readonly eventBus: EventBus,
        private readonly domainStoryElementRegistryService: ElementRegistryService,
    ) {}

    isNumberMultiple(number: number): boolean {
        return this.multipleNumberRegistry[number] ?? false;
    }

    setNumberIsMultiple(number: number, multi: boolean) {
        this.multipleNumberRegistry[number] = multi;
    }

    /**
     * A snapshot an undoable command can hold onto. The **copy is load-bearing**:
     * `ActivityChangedHandler` keeps it in its command context for the lifetime
     * of the action, across undo → redo → undo. Handing out the live array would
     * let the redo's cascade write through the snapshot, so the second undo would
     * restore post-edit values — silently, with no error anywhere.
     */
    snapshotMultipleNumberRegistry(): boolean[] {
        return [...this.multipleNumberRegistry];
    }

    /**
     * Restores a snapshot taken by `snapshotMultipleNumberRegistry`.
     *
     * **Replaces rather than merges**, and copies again on the way in. A
     * per-index write-back would leave behind the slots a cascade added *beyond*
     * the snapshot's length; copying keeps the caller's snapshot reusable for the
     * next undo.
     */
    restoreMultipleNumberRegistry(snapshot: readonly boolean[]): void {
        this.multipleNumberRegistry = [...snapshot];
    }

    updateMultipleNumberRegistry(
        activityBusinessObjects: ActivityBusinessObject[],
    ) {
        activityBusinessObjects.forEach(
            (activity) =>
                (this.multipleNumberRegistry[activity.number ?? 0] =
                    activity.multipleNumberAllowed),
        );
    }

    /**
     * Get the IDs of activities with their associated number, only returns activities that are originating from an actor
     */
    getNumbersAndIDs(): { id: string; number: number | undefined }[] {
        const iDWithNumber = [];
        const activities =
            this.domainStoryElementRegistryService.getActivitiesFromActors();

        for (let i = activities.length - 1; i >= 0; i--) {
            const id = activities[i].businessObject.id;
            const number = activities[i].businessObject.number;
            iDWithNumber.push({ id: id, number: number });
        }
        return iDWithNumber;
    }

    /**
     * Determine the next available number that is not yet used
     */
    generateAutomaticNumber(elementActivity: Element) {
        const usedNumbers = this.domainStoryElementRegistryService
            .getActivitiesFromActors()
            .map((activity) => activity.businessObject.number);

        const wantedNumber = nextAvailableActivityNumber(usedNumbers);

        elementActivity.businessObject.number = wantedNumber;
        return wantedNumber;
    }

    /**
     * Update the numbers at the activities when editing an activity.
     *
     * `activitiesFromActors` may include the edited activity — the domain
     * excludes it by `edit.id` — and must be read *before* the edit is written
     * to the model, so the cascade sees the numbers it has to move out of the
     * way. Applying the allowance updates before the assignments keeps the
     * pre-edit flags readable inside `renumberOnNumberEdit`.
     */
    updateExistingNumbersAtEditing(
        activitiesFromActors: ActivityCanvasObject[],
        edit: ActivityNumberEdit,
    ) {
        const { assignments, multipleAllowedUpdates } = renumberOnNumberEdit(
            activitiesFromActors.map((activity) => ({
                id: activity.businessObject.id,
                number: activity.businessObject.number,
            })),
            edit,
            this.multipleNumberRegistry,
        );

        multipleAllowedUpdates.forEach(
            (update) =>
                (this.multipleNumberRegistry[update.number] = update.allowed),
        );

        const activitiesById = new Map(
            activitiesFromActors.map((activity) => [
                activity.businessObject.id,
                activity,
            ]),
        );
        assignments.forEach(({ id, newNumber }) => {
            const element = activitiesById.get(id);
            if (!element) {
                return;
            }
            element.businessObject.number = newNumber;
            this.eventBus.fire("element.changed", { element });
        });
    }
}
