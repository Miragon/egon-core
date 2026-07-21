import { CanvasObject } from "../entities/canvasObject";

/**
 * Read access to the elements currently present on the canvas, seen through
 * domain eyes. This port exists so domain services can query canvas state
 * without importing diagram-js: at runtime didi injects diagram-js's
 * `ElementRegistry` (service name `elementRegistry`), which satisfies this
 * interface structurally. Only the two operations the domain actually needs
 * are exposed — widening it would just re-couple the domain to the framework.
 */
export interface ElementRegistryPort {
    find(
        predicate: (element: CanvasObject) => boolean,
    ): CanvasObject | undefined;

    getAll(): CanvasObject[];
}
