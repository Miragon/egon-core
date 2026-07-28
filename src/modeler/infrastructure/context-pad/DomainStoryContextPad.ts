import ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import Canvas from "diagram-js/lib/core/Canvas";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import EventBus from "diagram-js/lib/core/EventBus";
import { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import { isArray } from "min-dash";
import { isConnection } from "diagram-js/lib/util/ModelUtil";

type ContextPadTarget = Element | Element[];

interface ContextPadInternal extends ContextPad {
    _canvas: Canvas;
    _getTargetBounds(target: ContextPadTarget): DOMRect;
}

/**
 * Custom ContextPad that uses element model bounds instead of SVG graphics bounds
 * for positioning. This ensures the context pad is positioned correctly relative
 * to the element's logical position rather than its rendered SVG bounds.
 */
export class DomainStoryContextPad extends ContextPad {
    static override $inject: string[] = [
        "canvas",
        "elementRegistry",
        "eventBus",
        "scheduler",
    ];

    constructor(
        canvas: Canvas,
        elementRegistry: ElementRegistry,
        eventBus: EventBus,
        scheduler: any,
    ) {
        super(canvas, elementRegistry, eventBus, scheduler);

        // Override the prototype method to use element model bounds
        const self = this as unknown as ContextPadInternal;
        self._getTargetBounds = this.getTargetBoundsFromModel.bind(this);
    }

    /**
     * Calculate target bounds from element model coordinates instead of SVG graphics bounds.
     * This fixes positioning issues where the SVG bounding box differs from the element's
     * logical bounds (e.g., due to labels, invisible elements, or viewBox differences).
     *
     * Connections keep the stock treatment: their model has waypoints, not a
     * box, so there is nothing to read x/y/width/height off. Skipping them
     * entirely is not an option — activities *are* connections, and a
     * connection-only selection would leave the accumulator at its Infinity
     * seed, which renders the pad at the canvas origin.
     */
    private getTargetBoundsFromModel(target: ContextPadTarget): DOMRect {
        const self = this as unknown as ContextPadInternal;
        const elements = isArray(target) ? target : [target];

        // Get the canvas viewbox to transform element coordinates to screen coordinates
        const viewbox = self._canvas.viewbox();
        const container = self._canvas.getContainer();
        const containerBounds = container.getBoundingClientRect();

        // Calculate the combined bounds of all elements using their model coordinates
        const bounds = elements.reduce(
            (acc, element) => {
                // A connection has no model box; measure its rendered graphics,
                // which the stock implementation uses for everything and which
                // are already in screen coordinates.
                if (isConnection(element)) {
                    const gfxBounds = self._canvas
                        .getGraphics(element as Connection)
                        .getBoundingClientRect();

                    acc.top = Math.min(acc.top, gfxBounds.top);
                    acc.left = Math.min(acc.left, gfxBounds.left);
                    acc.right = Math.max(acc.right, gfxBounds.right);
                    acc.bottom = Math.max(acc.bottom, gfxBounds.bottom);

                    return acc;
                }

                const shape = element as Shape;

                // Transform element model coordinates to screen coordinates
                const x =
                    (shape["x"] - viewbox.x) * viewbox.scale +
                    containerBounds.left;
                const y =
                    (shape["y"] - viewbox.y) * viewbox.scale +
                    containerBounds.top;
                const width = shape["width"] * viewbox.scale;
                const height = shape["height"] * viewbox.scale;

                acc.top = Math.min(acc.top, y);
                acc.left = Math.min(acc.left, x);
                acc.right = Math.max(acc.right, x + width);
                acc.bottom = Math.max(acc.bottom, y + height);

                return acc;
            },
            {
                top: Infinity,
                left: Infinity,
                right: -Infinity,
                bottom: -Infinity,
            },
        );

        // Create a DOMRect-like object
        return {
            top: bounds.top,
            left: bounds.left,
            right: bounds.right,
            bottom: bounds.bottom,
            x: bounds.left,
            y: bounds.top,
            width: bounds.right - bounds.left,
            height: bounds.bottom - bounds.top,
            toJSON: () => ({}),
        };
    }
}
