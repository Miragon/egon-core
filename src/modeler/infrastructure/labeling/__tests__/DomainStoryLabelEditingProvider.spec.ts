import { describe, expect, it, vi } from "vitest";
import { Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";

import { DomainStoryLabelEditingProvider } from "../DomainStoryLabelEditingProvider";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Regression lock for issue #7 (upstream wps/egon.io@e62bd235): `update()` must
 * hand the edited label to the model verbatim. It previously ran every label
 * through `sanitizeTextForSVGExport`, mangling user input on canvas
 * ("--" → "––"). SVG-safety is an export-time concern, not a model concern.
 *
 * Also covers the dblclick handler's one job for an activity: close the inline
 * editing box again, because an activity is edited through the numbering popup.
 * It used to stash the number here for the renderer to read back on the next
 * repaint; that hand-off died with #74, when numbering moved into commands.
 */

/** Fixed bounding box so `update()`'s bounds math has non-zero denominators. */
const BBOX = { x: 0, y: 0, width: 100, height: 60 };

/**
 * Build the provider with the minimal stubs its constructor and `update()`
 * touch. The constructor registers handlers/listeners and completes direct
 * editing on dblclick, so `directEditing` gets `activate`/`complete` no-ops;
 * `update()` reads `canvas.getAbsoluteBBox` and writes through
 * `modeling.updateLabel`, which is the seam under test.
 */
function setup() {
    const updateLabel = vi.fn();

    const modeling = { updateLabel } as any;
    const domainStoryTextRenderer = {} as any;
    const labelDictionaryService = {} as any;
    const eventBus = { on: vi.fn() } as any;
    const canvas = { getAbsoluteBBox: () => BBOX } as any;
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

    return { provider, updateLabel, eventBus, directEditing };
}

/**
 * Pull the handler the constructor registered for a given eventBus event. The
 * constructor wires everything through `eventBus.on(event, cb)`, so replaying a
 * captured `cb` is how we drive a listener in isolation.
 */
function capturedHandler(eventBus: any, event: string): (e: any) => void {
    const call = eventBus.on.mock.calls.find(
        ([registeredEvent]: [string]) => registeredEvent === event,
    );
    if (!call) {
        throw new Error(`no handler registered for "${event}"`);
    }
    return call[call.length - 1];
}

/** A non-text-annotation shape so `update()` takes its bounds-recomputing path. */
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

describe("DomainStoryLabelEditingProvider.update", () => {
    it("passes the label to the model verbatim, without SVG sanitizing", () => {
        const { provider, updateLabel } = setup();
        const element = makeElement();
        const bounds = { x: 0, y: 0, width: 100, height: 60 } as Rect;

        provider.update(element, "a--b <c> d", bounds);

        expect(updateLabel).toHaveBeenCalledTimes(1);
        expect(updateLabel.mock.calls[0][1]).toBe("a--b <c> d");
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

        // An activity's label and number are edited through the numbering popup,
        // so the box `activateDirectEdit` just opened is completed straight away.
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
