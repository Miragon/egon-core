import { describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";
import Canvas from "diagram-js/lib/core/Canvas";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { Connection, Shape } from "diagram-js/lib/model/Types";

import { DomainStoryContextPad } from "../DomainStoryContextPad";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Activities are connections: skipping them would leave the reduce at its
 * Infinity seed, and the browser drops `"Infinitypx"`, so the pad jumps to the
 * canvas origin.
 */

/** Viewbox at 1:1 with no pan, so model coordinates are screen coordinates. */
const VIEWBOX = { x: 0, y: 0, width: 1000, height: 1000, scale: 1 };

/** Screen-space box the stubbed graphics of a connection report. */
const CONNECTION_GFX_RECT = {
    top: 40,
    left: 20,
    right: 220,
    bottom: 60,
} as DOMRect;

function makeShape(x: number, y: number): Shape {
    return {
        type: ElementTypes.WORKOBJECT + "Document",
        x,
        y,
        width: 50,
        height: 50,
    } as unknown as Shape;
}

/** `isConnection` recognises anything carrying `waypoints`. */
function makeActivity(): Connection {
    return {
        type: ElementTypes.ACTIVITY,
        waypoints: [
            { x: 20, y: 40 },
            { x: 220, y: 60 },
        ],
    } as unknown as Connection;
}

/** Container at the viewport origin: model and screen coordinates match. */
function contextPad() {
    // A real node: ContextPad's constructor appends its parent element to it.
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    const canvas = {
        viewbox: () => VIEWBOX,
        getContainer: () => container,
        getGraphics: () => ({
            getBoundingClientRect: () => CONNECTION_GFX_RECT,
        }),
    } as unknown as Canvas;

    const pad = new DomainStoryContextPad(
        canvas,
        {} as unknown as ElementRegistry,
        new EventBus(),
        {} as any,
    );

    return (target: unknown): DOMRect =>
        (pad as any)._getTargetBounds(target as never);
}

describe("DomainStoryContextPad target bounds", () => {
    it("gives a connection-only selection finite bounds", () => {
        const getTargetBounds = contextPad();

        const bounds = getTargetBounds([makeActivity(), makeActivity()]);

        expect(bounds).toMatchObject({
            top: 40,
            left: 20,
            right: 220,
            bottom: 60,
            width: 200,
            height: 20,
        });
    });

    it("unions connection graphics with shape model bounds", () => {
        const getTargetBounds = contextPad();

        // Shape spans 300..350 horizontally and 10..60 vertically; the
        // connection spans 20..220 / 40..60.
        const bounds = getTargetBounds([makeActivity(), makeShape(300, 10)]);

        expect(bounds).toMatchObject({
            top: 10,
            left: 20,
            right: 350,
            bottom: 60,
        });
    });
});
