import EventBus from "diagram-js/lib/core/EventBus";

import { ElementRegistryService } from "../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../story/domain/canvasObject";
import { ActivityBusinessObject } from "../../../story/domain/activityBusinessObject";
import {
    ActivityNumberEdit,
    nextAvailableActivityNumber,
    renumberOnNumberEdit,
} from "../../../story/domain/activityNumbering";

/**
 * Applies `story/domain/activityNumbering` to the live canvas and owns the
 * mutable multiple-number registry (ADR ARC-5).
 */
export class DomainStoryNumberingRegistry {
    static $inject: string[] = [
        "eventBus",
        "domainStoryElementRegistryService",
    ];

    /** Whether the number at each index may occur multiple times. */
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
     * A copy, because `ActivityChangedHandler` keeps it across undo/redo; the live
     * array would let a redo's cascade write through it.
     */
    snapshotMultipleNumberRegistry(): boolean[] {
        return [...this.multipleNumberRegistry];
    }

    /**
     * Replaces rather than merges, so slots a cascade added beyond the snapshot
     * vanish; copies so the snapshot stays reusable for the next undo.
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

    /** Only activities that originate from an actor. */
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
     * A pure query: callers compute the number before executing a command, which
     * must still snapshot the unmutated model for undo.
     */
    generateAutomaticNumber(): number {
        const usedNumbers = this.domainStoryElementRegistryService
            .getActivitiesFromActors()
            .map((activity) => activity.businessObject.number);

        return nextAvailableActivityNumber(usedNumbers);
    }

    /**
     * `activitiesFromActors` must be read before the edit is written, so the
     * cascade sees the numbers it has to move out of the way.
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
