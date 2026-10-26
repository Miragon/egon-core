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
 * Positions the pad from model bounds, not SVG bounds, which labels and
 * invisible parts inflate.
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

        const self = this as unknown as ContextPadInternal;
        self._getTargetBounds = this.getTargetBoundsFromModel.bind(this);
    }

    /**
     * Connections have no model box, so they use their rendered bounds. They
     * cannot be skipped: a connection-only selection would leave the Infinity
     * seed and put the pad at the canvas origin.
     */
    private getTargetBoundsFromModel(target: ContextPadTarget): DOMRect {
        const self = this as unknown as ContextPadInternal;
        const elements = isArray(target) ? target : [target];

        const viewbox = self._canvas.viewbox();
        const container = self._canvas.getContainer();
        const containerBounds = container.getBoundingClientRect();

        const bounds = elements.reduce(
            (acc, element) => {
                // Graphics bounds are already in screen coordinates.
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
