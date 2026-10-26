import { CanvasObject } from "../../../story/domain/canvasObject";

/**
 * Lets domain code query canvas elements without importing diagram-js; didi
 * injects `elementRegistry`, which satisfies it structurally. Keep it narrow.
 */
export interface ElementRegistryPort {
    find(
        predicate: (element: CanvasObject) => boolean,
    ): CanvasObject | undefined;

    getAll(): CanvasObject[];
}
