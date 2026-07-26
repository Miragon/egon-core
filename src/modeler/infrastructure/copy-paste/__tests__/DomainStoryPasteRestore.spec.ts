import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryPasteRestore } from "../DomainStoryPasteRestore";
import { DomainStoryCopyPaste } from "../DomainStoryCopyPaste";
import { DomainStoryPropertyCopy } from "../DomainStoryPropertyCopy";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Regression tests for the issue #9 paste-restore port. They drive a real
 * diagram-js EventBus with synthetic copy-paste events (no diagram bootstrap,
 * precedent: labeling/__tests__/utils.spec.ts) to prove that pasted elements
 * keep their color and that pasted text annotations keep their text/height.
 * The two documented deviations from upstream — the length guard on
 * `create.end` and the stash reset on `copyPaste.pasteElements` — are locked in
 * by the "palette create" and "cancelled paste" cases.
 */

const ACTOR_TYPE = ElementTypes.ACTOR + "Person";
const ANNOTATION_TYPE = ElementTypes.TEXTANNOTATION;

/** A pasted element as diagram-js hands it back on `create.end`. */
function createdElement(type: string): {
    type: string;
    businessObject: any;
    height?: number;
} {
    return { type, businessObject: {} };
}

/** The `copyPaste.pasteElement` context, carrying the still-attached copy. */
function pasteElementEvent(oldBusinessObject: any) {
    return {
        cache: {},
        descriptor: { type: oldBusinessObject.type, oldBusinessObject },
    };
}

/** Record the elements a `element.changed` repaint is requested for. */
function collectElementChanged(eventBus: EventBus): any[] {
    const changed: any[] = [];
    eventBus.on("element.changed", (event: any) => changed.push(event.element));
    return changed;
}

describe("DomainStoryPasteRestore", () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        new DomainStoryPasteRestore(eventBus);
    });

    it("restores pickedColor onto a pasted element and repaints it once", () => {
        const changed = collectElementChanged(eventBus);

        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ACTOR_TYPE, pickedColor: "#ff0000" }),
        );

        const element = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.businessObject.pickedColor).toBe("#ff0000");
        expect(changed).toEqual([element]);
    });

    it("stashes the color before DomainStoryCopyPaste deletes oldBusinessObject", () => {
        // Wire the real sibling services onto the same bus. This locks the
        // priority ordering: DomainStoryCopyPaste (1000) strips
        // `oldBusinessObject` while handling `copyPaste.pasteElement`, so if the
        // restore listener did not run at the higher 10000 priority the color
        // would already be gone by the time it looked.
        const propertyCopy = new DomainStoryPropertyCopy(eventBus);
        new DomainStoryCopyPaste(propertyCopy, eventBus);

        const event = pasteElementEvent({
            type: ACTOR_TYPE,
            name: "Actor",
            pickedColor: "#00ff00",
        });
        eventBus.fire("copyPaste.pasteElement", event);

        // proof the deleter ran: the copy is gone from the descriptor...
        expect(event.descriptor.oldBusinessObject).toBeUndefined();

        // ...yet the color still lands on the created element.
        const element = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [element] });
        expect(element.businessObject.pickedColor).toBe("#00ff00");
    });

    it("restores text, height and the persisted number on a text annotation", () => {
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({
                type: ANNOTATION_TYPE,
                text: "note",
                height: 80,
            }),
        );

        const element = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.businessObject.text).toBe("note");
        expect(element.height).toBe(80);
        // renderer persists annotation height via `number` (drawAnnotation).
        expect(element.businessObject.number).toBe(80);
    });

    it("reads the height off `number` when the copy carries no `height`", () => {
        // This is the *normal* case on a live canvas: `drawAnnotation` records
        // the height as `number` and only the export pass ever writes `height`,
        // so a session-drawn annotation reaches paste with `number` alone.
        // Covered end to end by CopyPasteIntegration.browser.spec.ts.
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({
                type: ANNOTATION_TYPE,
                text: "note",
                number: 80,
            }),
        );

        const element = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.height).toBe(80);
        expect(element.businessObject.number).toBe(80);
    });

    it("falls back to empty text for an annotation copied without text", () => {
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ANNOTATION_TYPE, height: 40 }),
        );

        const element = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.businessObject.text).toBe("");
    });

    it("maps colors by index and consumes annotation values in paste order", () => {
        const changed = collectElementChanged(eventBus);

        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ACTOR_TYPE, pickedColor: "#111111" }),
        );
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ACTOR_TYPE, pickedColor: "#222222" }),
        );
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({
                type: ANNOTATION_TYPE,
                text: "note",
                height: 90,
            }),
        );

        const first = createdElement(ACTOR_TYPE);
        const second = createdElement(ACTOR_TYPE);
        const annotation = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", {
            elements: [first, second, annotation],
        });

        expect(first.businessObject.pickedColor).toBe("#111111");
        expect(second.businessObject.pickedColor).toBe("#222222");
        expect(annotation.businessObject.text).toBe("note");
        expect(annotation.height).toBe(90);
        expect(changed).toEqual([first, second, annotation]);

        // stashes are empty, so a subsequent palette-create stays untouched.
        const paletteElement = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [paletteElement] });
        expect("pickedColor" in paletteElement.businessObject).toBe(false);
    });

    it("leaves an ordinary palette-create untouched (length guard)", () => {
        const changed = collectElementChanged(eventBus);

        const element = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect("pickedColor" in element.businessObject).toBe(false);
        expect(changed).toEqual([]);
    });

    it("drops stale stash state when a paste is restarted (cancelled paste)", () => {
        // Fill the stash, then never place it (Escape) — the next paste starts
        // with `copyPaste.pasteElements`, which must clear the leak.
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ACTOR_TYPE, pickedColor: "#deadbe" }),
        );

        eventBus.fire("copyPaste.pasteElements", {});

        const element = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        // no stale "#deadbe" applied; the guard sees an empty stash.
        expect("pickedColor" in element.businessObject).toBe(false);
    });
});
