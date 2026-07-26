import type Canvas from "diagram-js/lib/core/Canvas";
import type { Point } from "diagram-js/lib/util/Types";

/**
 * Builds the synthetic mouse event `dragging.move()` expects, from a point in
 * *diagram* coordinates.
 *
 * WHY it is hand-rolled: diagram-js ships an equivalent (`test/util/MockEvents`)
 * but publishes only `lib/`, so it cannot be imported. WHY it is needed at all:
 * a programmatic `copyPaste.paste({ element, point })` never fires `create.end`
 * (documented in `DomainStoryPasteRestore`), and `create.end` is where the
 * colour/text/height restore happens — so only a real
 * `dragging.hover/move/end` sequence exercises it.
 *
 * `Dragging.toLocalPoint` reads `clientX`/`clientY` and converts with
 * `viewbox.x + (client - containerRect.left) / viewbox.scale`; this is the exact
 * inverse, so `move(canvasEvent(canvas, p))` lands the drag at diagram point `p`.
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
