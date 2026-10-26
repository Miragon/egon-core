import { describe, expect, it, vi } from "vitest";
import { Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";

import { DomainStoryLabelEditingProvider } from "../DomainStoryLabelEditingProvider";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * `update()` must hand the edited label to the model verbatim: SVG-safety is an
 * export-time concern, and sanitizing mangles input on canvas ("--" → "––").
 */

/** Fixed bounding box so `update()`'s bounds math has non-zero denominators. */
const BBOX = { x: 0, y: 0, width: 100, height: 60 };

/** `modeling.updateLabel` is the seam under test. */
function setup() {
    const updateLabel = vi.fn();

    const modeling = { updateLabel } as any;
    const domainStoryTextRenderer = {
        getDefaultStyle: () => ({
            fontSize: 11,
            lineHeight: 1.2,
            fontFamily: "Arial",
            fontWeight: "normal",
        }),
    } as any;
    const labelDictionaryService = {} as any;
    const eventBus = { on: vi.fn() } as any;
    const canvas = {
        getAbsoluteBBox: vi.fn(() => BBOX),
        zoom: () => 1,
    } as any;
    const directEditing = {
        registerProvider: vi.fn(),
        activate: vi.fn(),
        complete: vi.fn(),
    } as any;
    const resizeHandles = { removeResizers: vi.fn() } as any;
    const commandStack = { registerHandler: vi.fn() } as any;

    const provider = new DomainStoryLabelEditingProvider(
        modeling,
        domainStoryTextRenderer,
        labelDictionaryService,
        eventBus,
        canvas,
        directEditing,
        resizeHandles,
        commandStack,
    );

    return { provider, updateLabel, eventBus, directEditing, canvas };
}

function capturedHandler(eventBus: any, event: string): (e: any) => void {
    const call = eventBus.on.mock.calls.find(
        ([registeredEvent]: [string]) => registeredEvent === event,
    );
    if (!call) {
        throw new Error(`no handler registered for "${event}"`);
    }
    return call[call.length - 1];
}

/** A non-text-annotation shape, which keeps its own external-label layout. */
function makeElement(): Shape {
    return {
        type: "domainStory:workObjectDocument",
        businessObject: { type: "domainStory:workObjectDocument" },
        x: 10,
        y: 20,
        width: 30,
        height: 40,
    } as unknown as Shape;
}

/** A text annotation — the only element type `update()` re-bounds. */
function makeAnnotation(): Shape {
    return {
        type: ElementTypes.TEXTANNOTATION,
        businessObject: { type: ElementTypes.TEXTANNOTATION },
        x: 10,
        y: 20,
        width: 50,
        height: 30,
    } as unknown as Shape;
}

/** The bounds DirectEditing measures off the edit box, doubling the bbox. */
const EDIT_BOX_BOUNDS = { x: 0, y: 0, width: 200, height: 120 } as Rect;

describe("DomainStoryLabelEditingProvider.update", () => {
    it("passes the label to the model verbatim, without SVG sanitizing", () => {
        const { provider, updateLabel } = setup();

        provider.update(
            makeElement(),
            "a--b <c> d",
            "old text",
            EDIT_BOX_BOUNDS,
        );

        expect(updateLabel).toHaveBeenCalledTimes(1);
        expect(updateLabel.mock.calls[0][1]).toBe("a--b <c> d");
    });

    it("scales the edit-box bounds onto a resized text annotation", () => {
        const { provider, updateLabel } = setup();
        const annotation = makeAnnotation();

        provider.update(annotation, "note", "old text", EDIT_BOX_BOUNDS);

        // The box grew 2x against the bbox, so the annotation grows 2x too.
        expect(updateLabel.mock.calls[0][2]).toEqual({
            x: annotation.x,
            y: annotation.y,
            width: 100,
            height: 60,
        });
    });

    it("leaves bounds undefined for elements that lay out their own label", () => {
        const { provider, updateLabel } = setup();

        provider.update(makeElement(), "name", "old text", EDIT_BOX_BOUNDS);

        expect(updateLabel.mock.calls[0][2]).toBeUndefined();
    });
});

describe("DomainStoryLabelEditingProvider.activate", () => {
    it("uses the business object as the semantic label source", () => {
        const { provider } = setup();

        expect(
            provider.activate({
                ...makeElement(),
                type: "diagram:shape",
                businessObject: {
                    type: ElementTypes.WORKOBJECT + "Document",
                    name: "Invoice",
                },
            } as Shape),
        ).toMatchObject({ text: "Invoice" });
    });

    it("blocks the canvas background even if it carries supported semantics", () => {
        const { provider, canvas } = setup();

        expect(
            provider.activate({
                ...makeElement(),
                id: "__implicitroot_1",
                businessObject: {
                    type: ElementTypes.ACTOR + "Person",
                    name: "Background actor",
                },
            } as Shape),
        ).toBeUndefined();
        expect(canvas.getAbsoluteBBox).not.toHaveBeenCalled();
    });

    it("blocks unsupported semantic types before opening an editor", () => {
        const { provider, canvas } = setup();

        expect(
            provider.activate({
                ...makeElement(),
                businessObject: {
                    type: ElementTypes.CONNECTION,
                    name: "unsupported",
                },
            } as Shape),
        ).toBeUndefined();
        expect(canvas.getAbsoluteBBox).not.toHaveBeenCalled();
    });
});

describe("DomainStoryLabelEditingProvider create.end", () => {
    /** A real node, so `focusElement`'s timer does not call `.focus()` on null. */
    function withEditingBoxInDom() {
        const box = document.createElement("div");
        box.className = "djs-direct-editing-content";
        document.body.appendChild(box);
        return () => box.remove();
    }

    function fireCreateEnd(hints?: Record<string, unknown>) {
        const { eventBus, directEditing } = setup();
        const removeBox = withEditingBoxInDom();

        capturedHandler(
            eventBus,
            "create.end",
        )({
            shape: makeElement(),
            context: { canExecute: true, hints },
        });

        removeBox();
        return directEditing;
    }

    it("opens the editor for a freshly created element", () => {
        expect(fireCreateEnd().activate).toHaveBeenCalledTimes(1);
    });

    it("stays out of the way of a paste", () => {
        const directEditing = fireCreateEnd({
            createElementsBehavior: false,
        });

        expect(directEditing.activate).not.toHaveBeenCalled();
    });
});

describe("DomainStoryLabelEditingProvider dblclick", () => {
    it("closes the inline editing box again for an activity", () => {
        const { eventBus, directEditing } = setup();
        const dblclick = capturedHandler(eventBus, "element.dblclick");

        dblclick({
            element: {
                type: ElementTypes.ACTIVITY,
                businessObject: { type: ElementTypes.ACTIVITY, number: 5 },
            },
        });

        expect(directEditing.activate).toHaveBeenCalledTimes(1);
        expect(directEditing.complete).toHaveBeenCalledTimes(1);
    });

    it("leaves the editing box open for a work object", () => {
        const { eventBus, directEditing } = setup();
        const dblclick = capturedHandler(eventBus, "element.dblclick");

        dblclick({ element: makeElement() });

        expect(directEditing.activate).toHaveBeenCalledTimes(1);
        expect(directEditing.complete).not.toHaveBeenCalled();
    });
});
