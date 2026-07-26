import { afterEach, describe, expect, it } from "vitest";
import type CopyPaste from "diagram-js/lib/features/copy-paste/CopyPaste";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import { canvasEvent } from "../../../../__tests__/helpers/canvasEvent";
import {
    addActor,
    addAnnotation,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Copy-paste driven through a real interaction — issue #55 checkbox 5.
 *
 * WHY the existing `DomainStoryPasteRestore.spec.ts` is not enough: it fires
 * synthetic events at a bare `EventBus`, so it can prove the listeners' logic
 * but not the ordering the real flow imposes. The one case it structurally
 * cannot reach is a **mixed multi-select paste**: `createEnd` indexes colours by
 * `parseInt(key)` but consumes text/height with FIFO `shift()`, and only a real
 * paste of annotation + actor + work object proves those two orderings agree.
 *
 * WHY browser tier (ADR 0014): every assertion here goes through
 * `canvas.addShape`, which needs `SVGSVGElement.createSVGTransform` — absent in
 * jsdom.
 *
 * WHY a real drag rather than `copyPaste.paste({ element, point })`: the direct
 * path never fires `create.end`, which is exactly where the colour/text/height
 * restore runs (documented in `DomainStoryPasteRestore`). So each paste runs
 * `dragging.setOptions({ manual: true })` + `hover`/`move`/`end`, the same
 * sequence a user's mouse produces.
 */
describe("copy-paste integration (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    /** Boots a modeler with dragging switched to manual, as pasting requires. */
    function bootWithManualDragging(): TestModeler {
        const booted = createTestModeler();
        booted.get<Dragging>("dragging").setOptions({ manual: true });
        return booted;
    }

    /**
     * Copies `elements`, then places the paste at `point` by driving the drag
     * diagram-js would otherwise get from the mouse. `hover` on the root is
     * required: `Create` rejects a placement with no hover target.
     */
    function copyAndPaste(
        booted: TestModeler,
        elements: unknown[],
        point: { x: number; y: number },
    ): void {
        const copyPaste = booted.get<CopyPaste>("copyPaste");
        const dragging = booted.get<Dragging>("dragging");

        copyPaste.copy(elements as never);
        copyPaste.paste();

        dragging.hover({
            element: booted.root as never,
            gfx: booted.canvas.getGraphics(booted.root as never),
        } as never);
        (dragging.move as (event: unknown) => void)(
            canvasEvent(booted.canvas, point),
        );
        (dragging.end as () => void)();
    }

    /**
     * A text annotation as the app produces one: sized, given text, then
     * redrawn — the redraw is what makes `drawAnnotation` stamp the height onto
     * `businessObject.number`, which is the only place a live story keeps it.
     *
     * Both dimensions are passed because `DomainStoryElementFactory`'s
     * `alreadyHasSize` guard is `attrs.height || attrs.width`: supplying one
     * suppresses *both* defaults and diagram-js then rejects the shape.
     */
    function annotationWithText(
        booted: TestModeler,
        text: string,
        height: number,
        point: { x: number; y: number },
    ) {
        const annotation = addAnnotation(booted, {
            point,
            width: 100,
            height,
        });
        annotation.businessObject.text = text;
        booted.eventBus.fire("element.changed", { element: annotation });
        return annotation;
    }

    /** Elements of `type` currently on the canvas, in registry order. */
    function elementsOfType(booted: TestModeler, type: string): any[] {
        return booted.elementRegistry.filter((element) =>
            (element["type"] ?? "").startsWith(type),
        ) as any[];
    }

    it("keeps pickedColor on a pasted actor and gives it a fresh id", () => {
        modeler = bootWithManualDragging();
        const actor = addActor(modeler, {
            point: { x: 150, y: 150 },
            name: "Alice",
            pickedColor: "#ff0000",
        });

        copyAndPaste(modeler, [actor], { x: 450, y: 150 });

        const actors = elementsOfType(modeler, ElementTypes.ACTOR);
        expect(actors).toHaveLength(2);
        const pasted = actors.find((element) => element.id !== actor.id);
        expect(pasted).toBeDefined();
        expect(pasted.businessObject.pickedColor).toBe("#ff0000");
        expect(pasted.businessObject.name).toBe("Alice");
    });

    it("keeps a text annotation's text and height, carrying height in `number`", () => {
        modeler = bootWithManualDragging();
        const annotation = annotationWithText(modeler, "a note", 80, {
            x: 150,
            y: 150,
        });
        // Precondition, and the reason this case needs a real canvas: the only
        // record of an annotation's height on a live story is
        // `businessObject.number`; `businessObject.height` is written by the
        // export pass alone.
        expect(annotation.businessObject.number).toBe(80);
        expect(annotation.businessObject.height).toBeUndefined();

        copyAndPaste(modeler, [annotation], { x: 500, y: 150 });

        const pasted = elementsOfType(
            modeler,
            ElementTypes.TEXTANNOTATION,
        ).find((element) => element.id !== annotation.id);
        expect(pasted.businessObject.text).toBe("a note");
        expect(pasted.height).toBe(80);
        // The renderer persists annotation height via `number`, because `height`
        // is not part of the exported annotation shape (drawAnnotation contract).
        expect(pasted.businessObject.number).toBe(80);
    });

    it("lands colours on the right elements in a mixed multi-select paste", () => {
        // The case the mock spec cannot reach: colours are indexed by position
        // while annotation text/height is consumed FIFO, so a paste containing an
        // annotation *and* coloured shapes is the only proof the orderings agree.
        modeler = bootWithManualDragging();
        const annotation = annotationWithText(modeler, "note", 60, {
            x: 120,
            y: 120,
        });
        const plainActor = addActor(modeler, { point: { x: 260, y: 120 } });
        const colouredWorkObject = addWorkObject(modeler, {
            point: { x: 400, y: 120 },
            pickedColor: "#00ff00",
        });

        copyAndPaste(modeler, [annotation, plainActor, colouredWorkObject], {
            x: 300,
            y: 420,
        });

        const pastedAnnotation = elementsOfType(
            modeler,
            ElementTypes.TEXTANNOTATION,
        ).find((element) => element.id !== annotation.id);
        const pastedActor = elementsOfType(modeler, ElementTypes.ACTOR).find(
            (element) => element.id !== plainActor.id,
        );
        const pastedWorkObject = elementsOfType(
            modeler,
            ElementTypes.WORKOBJECT,
        ).find((element) => element.id !== colouredWorkObject.id);

        expect(pastedAnnotation.businessObject.text).toBe("note");
        expect(pastedAnnotation.height).toBe(60);
        expect(pastedWorkObject.businessObject.pickedColor).toBe("#00ff00");
        expect(pastedActor.businessObject.pickedColor).toBeUndefined();
    });

    it("keeps a pasted activity's type and gives it the pasted endpoints", () => {
        modeler = bootWithManualDragging();
        const actor = addActor(modeler, { point: { x: 150, y: 150 } });
        const workObject = addWorkObject(modeler, {
            point: { x: 400, y: 150 },
        });
        const activity = connect(modeler, actor, workObject)!;

        copyAndPaste(modeler, [actor, workObject, activity], {
            x: 300,
            y: 450,
        });

        const activities = elementsOfType(modeler, ElementTypes.ACTIVITY);
        expect(activities).toHaveLength(2);
        const pasted = activities.find(
            (element) => element.id !== activity.id,
        )!;
        expect(pasted.type).toBe(ElementTypes.ACTIVITY);
        // Fresh endpoints: the copy must not reference the originals.
        expect(pasted.source.id).not.toBe(actor.id);
        expect(pasted.target.id).not.toBe(workObject.id);
        expect(pasted.businessObject.source).toBe(pasted.source.id);
        expect(pasted.businessObject.target).toBe(pasted.target.id);
    });

    it("undo of a paste removes exactly the pasted elements", () => {
        modeler = bootWithManualDragging();
        const actor = addActor(modeler, { point: { x: 150, y: 150 } });
        const idsBefore = modeler.elementRegistry
            .getAll()
            .map((element) => element.id)
            .sort();

        copyAndPaste(modeler, [actor], { x: 450, y: 150 });
        expect(elementsOfType(modeler, ElementTypes.ACTOR)).toHaveLength(2);

        modeler.commandStack.undo();

        expect(
            modeler.elementRegistry
                .getAll()
                .map((element) => element.id)
                .sort(),
        ).toEqual(idsBefore);
    });

    it("a cancelled paste leaves no residue and does not poison the next one", () => {
        // Locks the documented deviation from upstream: the stash is cleared on
        // `copyPaste.pasteElements`, so an Escaped paste cannot bleed its colour
        // into whatever is created next.
        modeler = bootWithManualDragging();
        const coloured = addActor(modeler, {
            point: { x: 150, y: 150 },
            pickedColor: "#deadbe",
        });
        const copyPaste = modeler.get<CopyPaste>("copyPaste");
        const dragging = modeler.get<Dragging>("dragging");

        copyPaste.copy([coloured] as never);
        copyPaste.paste();
        (dragging.cancel as () => void)();

        expect(elementsOfType(modeler, ElementTypes.ACTOR)).toHaveLength(1);

        // A plain palette-style create afterwards must stay uncoloured.
        const plain = addWorkObject(modeler, { point: { x: 450, y: 150 } });
        expect(plain.businessObject.pickedColor).toBeUndefined();
    });
});
