import { ElementRegistryPort } from "../domain/ports/ElementRegistryPort";
import {
    ActivityCanvasObject,
    CanvasObject,
} from "../../story/domain/canvasObject";
import { getIconId } from "../../story/domain/elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isGroup,
    isWorkObject,
} from "../../story/domain/elementPredicates";
import { activitiesFromActors } from "../../story/domain/activityNumbering";
import { GroupCanvasObject } from "../../story/domain/groupCanvasObject";
import { UsedIconList } from "../../story/domain/UsedIconList";

export class ElementRegistryService {
    static $inject: string[] = ["elementRegistry"];

    constructor(private readonly registry: ElementRegistryPort) {}

    createObjectListForDSTDownload(): CanvasObject[] {
        if (this.registry) {
            const allObjectsFromCanvas = this.getAllCanvasObjects();
            const groups = this.getAllGroups();
            const objectList: CanvasObject[] = [];

            this.fillListOfCanvasObjects(
                allObjectsFromCanvas,
                objectList,
                groups,
            );

            return objectList;
        }
        return [];
    }

    getAllActivities(): ActivityCanvasObject[] {
        const activities: ActivityCanvasObject[] = [];

        this.getAllCanvasObjects().forEach((element) => {
            if (isActivity(element)) {
                activities.push(element as ActivityCanvasObject);
            }
        });
        return activities;
    }

    getAllCanvasObjects(): CanvasObject[] {
        const allObjects: CanvasObject[] = [];
        const groupObjects: GroupCanvasObject[] = [];

        this.checkChildForGroup(groupObjects, allObjects);

        // for each memorized group, remove it from the group-array and check its children, whether they are groups or not
        // if a child is a group, memorize it in the group-array
        // other children should already be in the allObjects list
        while (groupObjects.length >= 1) {
            const currentGroup = groupObjects.pop();
            currentGroup?.children?.forEach((child: CanvasObject) => {
                if (isGroup(child)) {
                    groupObjects.push(child as GroupCanvasObject);
                }
            });
        }
        return allObjects;
    }

    // returns all groups on the canvas and inside other groups
    getAllGroups(): GroupCanvasObject[] {
        const groupObjects: GroupCanvasObject[] = [];
        const allObjects: CanvasObject[] = [];

        this.checkChildForGroup(groupObjects, allObjects);

        for (const group of groupObjects) {
            group.children?.forEach((child: CanvasObject) => {
                if (isGroup(child)) {
                    groupObjects.push(child as GroupCanvasObject);
                }
            });
        }

        const seenIds = new Set<string>();

        return groupObjects.filter((groupObject) => {
            const isNewId = !seenIds.has(groupObject.id);
            if (isNewId) {
                seenIds.add(groupObject.id);
            }
            return isNewId;
        });
    }

    // get a list of activities, that originate from an actor-type
    getActivitiesFromActors(): ActivityCanvasObject[] {
        return activitiesFromActors(this.getAllActivities());
    }

    getActivityFromActorById(id: string): ActivityCanvasObject | undefined {
        return this.getActivitiesFromActors().find(
            (activity) => activity.id === id,
        );
    }

    getUsedIcons(): UsedIconList {
        const actors = this.getAllActors();
        const workObjects = this.getAllWorkObjects();

        return {
            actors: actors.map((a) => getIconId(a.type)),
            workObjects: workObjects.map((w) => getIconId(w.type)),
        };
    }

    getAllWorkObjects() {
        return this.getAllCanvasObjects().filter((co) => isWorkObject(co));
    }

    private fillListOfCanvasObjects(
        allObjectsFromCanvas: CanvasObject[],
        objectList: CanvasObject[],
        groups: GroupCanvasObject[],
    ): void {
        allObjectsFromCanvas.forEach((canvasElement) => {
            if (isActivity(canvasElement)) {
                objectList.push(canvasElement);
            }

            // ensure that Activities are always after Actors, Workobjects and Groups in .dst files
            else {
                if (isAnnotation(canvasElement)) {
                    canvasElement.businessObject.width = canvasElement.width;
                    canvasElement.businessObject.height = canvasElement.height;
                }
                if (!objectList.includes(canvasElement)) {
                    objectList.unshift(canvasElement);
                }
            }
        });

        groups.forEach((group) => {
            objectList.push(group);
        });
    }

    private checkChildForGroup(
        groupObjects: GroupCanvasObject[],
        allObjects: CanvasObject[],
    ): void {
        const registryElementNames = this.registry.getAll();
        for (const entry of registryElementNames) {
            if (entry.businessObject) {
                const type = entry["type"];
                if (isGroup(entry)) {
                    // if it is a group, memorize this for later
                    groupObjects.push(<GroupCanvasObject>entry);
                } else if (type) {
                    allObjects.push(<CanvasObject>entry);
                }
            }
        }
    }

    private getAllActors() {
        return this.getAllCanvasObjects().filter((co) => isActor(co));
    }
}
