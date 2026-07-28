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
 * keep their color and that pasted text annotations keep their text. Since #74
 * the height is not restored here at all — diagram-js carries it on the paste
 * descriptor and the element factory honours it, which
 * `CopyPasteIntegration.browser.spec.ts` proves end to end.
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

    it("restores text onto a pasted text annotation, and touches no height", () => {
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ANNOTATION_TYPE, text: "note" }),
        );

        const element = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.businessObject.text).toBe("note");
        // Inverted with #74. The height used to be restored here *and* mirrored
        // onto `businessObject.number` so it would survive an export. Neither
        // happens now: diagram-js carries `descriptor.height` and the element
        // factory honours it, so the height needs no help — and the export pass
        // writes `businessObject.height` itself, so `number` is retired.
        expect(element.height).toBeUndefined();
        expect("number" in element.businessObject).toBe(false);
    });

    it("ignores a legacy `number` on the copied business object", () => {
        // A pre-#74 file's annotation still carries the old height-in-`number`
        // hack; `useLegacyAnnotationNumberAsHeight` translates it away on import,
        // so by paste time it is meaningless. Reading it here would resurrect the
        // retired field and, when the two disagree, the wrong height.
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({
                type: ANNOTATION_TYPE,
                text: "note",
                number: 25,
                height: 80,
            }),
        );

        const element = createdElement(ANNOTATION_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.height).toBeUndefined();
        expect("number" in element.businessObject).toBe(false);
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
            pasteElementEvent({ type: ANNOTATION_TYPE, text: "note" }),
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

    it.each([["create.cancel"], ["create.rejected"]])(
        "drops the stash when the paste's create ends in %s",
        (endEvent) => {
            eventBus.fire(
                "copyPaste.pasteElement",
                pasteElementEvent({
                    type: ACTOR_TYPE,
                    pickedColor: "#deadbe",
                }),
            );

            // The paste's create context, marked by diagram-js CopyPaste.
            eventBus.fire(endEvent, {
                context: { hints: { createElementsBehavior: false } },
            });

            const element = createdElement(ACTOR_TYPE);
            eventBus.fire("create.end", { elements: [element] });

            expect("pickedColor" in element.businessObject).toBe(false);
        },
    );

    it("keeps the stash when an unrelated create drag is aborted", () => {
        // Starting a paste calls `dragging.init`, which cancels whatever drag
        // was active — firing `create.cancel` for *that* drag, after this paste
        // has already stashed its values.
        eventBus.fire(
            "copyPaste.pasteElement",
            pasteElementEvent({ type: ACTOR_TYPE, pickedColor: "#ff0000" }),
        );

        eventBus.fire("create.cancel", { context: { hints: {} } });

        const element = createdElement(ACTOR_TYPE);
        eventBus.fire("create.end", { elements: [element] });

        expect(element.businessObject.pickedColor).toBe("#ff0000");
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
