import { BusinessObject } from "./businessObject";
import { ActivityBusinessObject } from "./activityBusinessObject";
import { Waypoint } from "./waypoint";

/**
 * The canvas-element cluster of the domain model. `CanvasObject`,
 * `ActivityCanvasObject` and `RootObject` are mutually recursive — elements
 * know their parent and their connecting activities, activities connect
 * elements, the root holds children — so they live in one file: splitting
 * them across files forces an import cycle, which the architecture tests
 * (src/architecture.spec.ts) forbid.
 */
export interface RootObject {
    children: CanvasObject[];
    id: string;
}

export interface CanvasObject {
    attachers: any;
    host: any;

    parent: CanvasObject | RootObject;
    businessObject: BusinessObject;
    incoming: ActivityCanvasObject[] | undefined;
    outgoing: ActivityCanvasObject[] | undefined;

    id: string;
    type: string;
    height: number;
    width: number;
    x: number;
    y: number;
    name: string;
    text: string | undefined;

    pickedColor: string | undefined;
}

export interface ActivityCanvasObject extends CanvasObject {
    source: CanvasObject;
    target: CanvasObject;

    waypoints: Waypoint[];
    businessObject: ActivityBusinessObject;
}
