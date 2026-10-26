import { BusinessObject } from "./businessObject";
import { ActivityBusinessObject } from "./activityBusinessObject";
import { Waypoint } from "./waypoint";

/**
 * `CanvasObject`, `ActivityCanvasObject` and `RootObject` are mutually
 * recursive, so they share one file: splitting them creates an import cycle,
 * which the architecture tests forbid.
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
