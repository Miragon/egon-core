import type { BusinessObject } from "../domain/businessObject";
import type { Scope } from "../domain/scope";
import type { FileConfiguration } from "../../iconSet/service";

/** A validated point which is safe to hand to diagram-js. */
export interface PreparedWaypoint {
    readonly x: number;
    readonly y: number;
    readonly original?: {
        readonly x: number;
        readonly y: number;
    };
}

export interface PreparedMetadata {
    readonly title: string;
    readonly description: string;
    readonly version: string;
    readonly scope?: Scope;
}

export interface PreparedShape {
    readonly businessObject: BusinessObject;
    readonly id: string;
    readonly type: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly parentId?: string;
}

export interface PreparedConnection {
    readonly businessObject: BusinessObject;
    readonly id: string;
    readonly type: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly waypoints: PreparedWaypoint[];
}

/** Everything candidate materialization needs; contains no live editor state. */
export interface PreparedImport {
    readonly iconSetConfiguration: FileConfiguration | undefined;
    readonly metadata: PreparedMetadata;
    readonly groups: PreparedShape[];
    readonly shapes: PreparedShape[];
    readonly connections: PreparedConnection[];
    readonly removedConnections: readonly BusinessObject[];
}
