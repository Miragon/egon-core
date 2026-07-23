import { beforeEach, describe, expect, it, vi } from "vitest";
import { create as svgCreate } from "tiny-svg";
import EventBus from "diagram-js/lib/core/EventBus";
import Canvas from "diagram-js/lib/core/Canvas";
import { Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";

import { DomainStoryLabelEditingPreview } from "../DomainStoryLabelEditingPreview";
import { ElementTypes } from "../../../../story/domain/elementTypes";

// jsdom does not implement SVGSVGElement.createSVGTransform, so diagram-js's
// translate() throws. It only positions the preview group and never touches the
// path's `d`, so stubbing it keeps the test on jsdom without affecting what we
// assert.
vi.mock("diagram-js/lib/util/SvgTransformUtil", () => ({
    translate: vi.fn(),
}));

/**
 * Regression test for the annotation-resize preview (issue #8). The resize
 * handler used to call `svgAttr(path, pathString)` — passing the path *string*
 * where tiny-svg treats a string second argument as a getter, so the bracket
 * preview silently never followed the annotation's new height. The fix passes
 * an attrs object (`{ d: ... }`); this test drives activate→resize and asserts
 * the rendered path's `d` actually changes. jsdom supplies the SVG DOM.
 */

/**
 * Records handlers by event name and fires them with the raw context object.
 * diagram-js copies fired data onto the event the listener receives, so the
 * handlers' `context.active`/`context.height` reads work against this stand-in.
 */
class RecordingEventBus {
    private readonly handlers = new Map<string, (context: any) => void>();

    on(events: string | string[], callback: (context: any) => void) {
        for (const name of Array.isArray(events) ? events : [events]) {
            this.handlers.set(name, callback);
        }
    }

    fire(event: string, context: any) {
        const handler = this.handlers.get(event);
        if (!handler) {
            throw new Error(`No handler registered for '${event}'`);
        }
        handler(context);
    }
}

/**
 * Minimal Canvas: hands back the layer the preview appends to and a fixed
 * absolute bbox (height 50) that the resize handler divides by. Marker calls
 * are irrelevant to the path assertion, so they are no-ops.
 */
function makeCanvas(defaultLayer: SVGElement, bbox: Rect): Canvas {
    return {
        getDefaultLayer: () => defaultLayer,
        getAbsoluteBBox: () => bbox,
        addMarker: vi.fn(),
        removeMarker: vi.fn(),
    } as unknown as Canvas;
}

/** A text-annotation shape at height 30; `is()` only reads businessObject.type. */
function makeAnnotation(): Shape {
    return {
        type: ElementTypes.TEXTANNOTATION,
        businessObject: { type: ElementTypes.TEXTANNOTATION },
        width: 100,
        height: 30,
        x: 10,
        y: 20,
    } as unknown as Shape;
}

describe("DomainStoryLabelEditingPreview", () => {
    let defaultLayer: SVGElement;
    let eventBus: RecordingEventBus;

    beforeEach(() => {
        defaultLayer = svgCreate("g");
        eventBus = new RecordingEventBus();
        // element height 30 vs. bbox height 50 → resize scales incoming height by 0.6
        const canvas = makeCanvas(defaultLayer, {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
        } as Rect);
        new DomainStoryLabelEditingPreview(
            eventBus as unknown as EventBus,
            canvas,
        );
    });

    it("draws the bracket at the annotation's current height on activate", () => {
        eventBus.fire("directEditing.activate", {
            active: { element: makeAnnotation() },
        });

        const path = defaultLayer.querySelector("path");
        expect(path?.getAttribute("d")).toBe(
            "m 0, 0 m 10,0 l -10,0 l 0,30 l 10,0",
        );
    });

    it("updates the preview path's height on resize", () => {
        eventBus.fire("directEditing.activate", {
            active: { element: makeAnnotation() },
        });

        // newElementHeight = (element.height / bbox.height) * (height + dy)
        //                  = (30 / 50) * (100 + 0) = 60
        eventBus.fire("directEditing.resize", { height: 100, dy: 0 });

        const path = defaultLayer.querySelector("path");
        expect(path?.getAttribute("d")).toBe(
            "m 0, 0 m 10,0 l -10,0 l 0,60 l 10,0",
        );
    });
});
