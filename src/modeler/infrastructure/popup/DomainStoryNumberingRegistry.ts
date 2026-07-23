import EventBus from "diagram-js/lib/core/EventBus";
import { Element } from "diagram-js/lib/model/Types";

import { ElementRegistryService } from "../../service/ElementRegistryService";
import { ActivityCanvasObject } from "../../../story/domain/canvasObject";
import CommandStack from "diagram-js/lib/command/CommandStack";
import { ActivityBusinessObject } from "../../../story/domain/activityBusinessObject";

export class DomainStoryNumberingRegistry {
    static $inject: string[] = [
        "eventBus",
        "commandStack",
        "domainStoryElementRegistryService",
    ];

    /**
     * Specifies whether the index may occur multiple times.
     */
    private multipleNumberRegistry = [false];

    constructor(
        private readonly eventBus: EventBus,
        private readonly commandStack: CommandStack,
        private readonly domainStoryElementRegistryService: ElementRegistryService,
    ) {}

    isNumberMultiple(number: number): boolean {
        return this.multipleNumberRegistry[number] ?? false;
    }

    setNumberIsMultiple(number: number, multi: boolean) {
        this.multipleNumberRegistry[number] = multi;
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
    getNumbersAndIDs() {
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
        const semantic = elementActivity.businessObject;
        const usedNumbers = [0];
        let wantedNumber = -1;

        const activitiesFromActors =
            this.domainStoryElementRegistryService.getActivitiesFromActors();

        activitiesFromActors.forEach((element) => {
            if (element.businessObject.number) {
                usedNumbers.push(+element.businessObject.number);
            }
        });
        for (let i = 0; i < usedNumbers.length; i++) {
            if (!usedNumbers.includes(i)) {
                wantedNumber = i;
                i = usedNumbers.length;
            }
        }
        if (wantedNumber === -1) {
            wantedNumber = usedNumbers.length;
        }

        this.updateExistingNumbersAtGeneration(
            activitiesFromActors,
            wantedNumber,
        );
        semantic.number = wantedNumber;
        return wantedNumber;
    }

    /**
     * update the numbers at the activities when generating a new activity
     */
    updateExistingNumbersAtGeneration(
        activitiesFromActors: ActivityCanvasObject[],
        wantedNumber: number,
    ) {
        activitiesFromActors.forEach((element) => {
            const number = element.businessObject.number ?? 0;

            if (number >= wantedNumber) {
                wantedNumber++;
                setTimeout(() => {
                    this.commandStack.execute("activity.changed", {
                        businessObject: element.businessObject,
                        newLabel: element.businessObject.name,
                        newNumber: number,
                        element: element,
                    });
                }, 10);
            }
        });
    }

    /**
     * Update the numbers at the activities when editing an activity
     */
    updateExistingNumbersAtEditing(
        activitiesFromActors: ActivityCanvasObject[],
        wantedNumber: number,
    ) {
        // get a sorted list of all activities that could need changing
        const sortedActivities: ActivityCanvasObject[][] = [[]];
        activitiesFromActors.forEach((activity) => {
            if (activity.businessObject.number) {
                if (!sortedActivities[activity.businessObject.number]) {
                    sortedActivities[activity.businessObject.number] = [];
                }
                sortedActivities[activity.businessObject.number].push(activity);
            }
        });

        // set the number of each activity to the next highest number, starting from the number, we overrode
        const oldMultipleNumberRegistry = [...this.multipleNumberRegistry];
        let currentNumber = wantedNumber;
        for (
            currentNumber;
            currentNumber < sortedActivities.length;
            currentNumber++
        ) {
            if (sortedActivities[currentNumber]) {
                wantedNumber++;
                this.multipleNumberRegistry[wantedNumber] =
                    oldMultipleNumberRegistry[currentNumber];
                this.setNumberOfActivity(
                    sortedActivities[currentNumber],
                    wantedNumber,
                );
            }
        }
    }

    private setNumberOfActivity(
        elementArray: ActivityCanvasObject[],
        wantedNumber: number,
    ) {
        if (elementArray) {
            elementArray.forEach((element) => {
                if (element) {
                    const businessObject = element.businessObject;
                    if (businessObject) {
                        businessObject.number = wantedNumber;
                    }
                    this.eventBus.fire("element.changed", { element });
                }
            });
        }
    }
}
