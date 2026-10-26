import type Canvas from "diagram-js/lib/core/Canvas";
import type { Point } from "diagram-js/lib/util/Types";

/**
 * The mouse event `dragging.move()` expects, from a point in diagram
 * coordinates; it inverts `Dragging.toLocalPoint`. Only a real drag fires
 * `create.end`, where paste restores colour, text and height. Hand-rolled
 * because diagram-js does not publish its `test/util/MockEvents`.
 */
export function canvasEvent(
    canvas: Canvas,
    point: Point,
    data: Record<string, unknown> = {},
): Record<string, unknown> {
    const viewbox = canvas.viewbox();
    const containerRect = (
        canvas as unknown as { _container: HTMLElement }
    )._container.getBoundingClientRect();

    return {
        target: canvas.getContainer(),
        clientX: containerRect.left + (point.x - viewbox.x) * viewbox.scale,
        clientY: containerRect.top + (point.y - viewbox.y) * viewbox.scale,
        // Dragging's `trapClick` path calls these on the original event.
        preventDefault: () => {},
        stopPropagation: () => {},
        ...data,
    };
}
