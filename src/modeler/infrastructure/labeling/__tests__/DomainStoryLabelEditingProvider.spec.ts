import { describe, expect, it, vi } from "vitest";
import { Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";

import { DomainStoryLabelEditingProvider } from "../DomainStoryLabelEditingProvider";

/**
 * Regression lock for issue #7 (upstream wps/egon.io@e62bd235): `update()` must
 * hand the edited label to the model verbatim. It previously ran every label
 * through `sanitizeTextForSVGExport`, mangling user input on canvas
 * ("--" → "––"). SVG-safety is an export-time concern, not a model concern.
 */

/** Fixed bounding box so `update()`'s bounds math has non-zero denominators. */
const BBOX = { x: 0, y: 0, width: 100, height: 60 };

/**
 * Build the provider with the minimal stubs its constructor and `update()`
 * touch. The constructor only registers handlers/listeners, so those deps are
 * no-ops; `update()` reads `canvas.getAbsoluteBBox` and writes through
 * `modeling.updateLabel`, which is the seam under test.
 */
function setup() {
    const updateLabel = vi.fn();

    const modeling = { updateLabel } as any;
    const domainStoryTextRenderer = {} as any;
    const labelDictionaryService = {} as any;
    const eventBus = { on: vi.fn() } as any;
    const canvas = { getAbsoluteBBox: () => BBOX } as any;
    const directEditing = { registerProvider: vi.fn() } as any;
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

    return { provider, updateLabel };
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
