import { afterEach, describe, expect, it } from "vitest";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import type { DomainStoryTextRenderer } from "../DomainStoryTextRenderer";

/**
 * The wiring half of the text-renderer config (issue #83): the renderer's
 * `$inject` named `config.textRenderer`, but nothing ever put a value there, so
 * a host's typography was accepted by the public API and silently dropped.
 *
 * WHY this is a separate spec from the renderer unit test: that one constructs
 * the class directly and proves the *merge*. Only a real boot proves the
 * *path* — `EgonClientConfig.textRenderer` → `DiagramJsModelerAdapter` → the
 * `new Diagram({ textRenderer })` option → didi's dotted `config.textRenderer`
 * key. Every hop there is a string the compiler cannot check.
 *
 * WHY browser tier (ADR 0014): the harness boots the production adapter, whose
 * render pass needs `getBBox`.
 */
describe("text renderer config wiring (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    function textRenderer(): DomainStoryTextRenderer {
        return modeler!.get<DomainStoryTextRenderer>("domainStoryTextRenderer");
    }

    it("reaches the renderer through the injector", () => {
        modeler = createTestModeler({
            textRenderer: {
                defaultStyle: { fontSize: 20, fontFamily: "Georgia" },
            },
        });

        expect(textRenderer().getDefaultStyle().fontSize).toBe(20);
        expect(textRenderer().getDefaultStyle().fontFamily).toBe("Georgia");
        // Derived from the merged default, so the external label stays one point
        // smaller than whatever the host asked for.
        expect(textRenderer().getExternalStyle().fontSize).toBe(19);
    });

    it("falls back to the built-in defaults when the host configures nothing", () => {
        modeler = createTestModeler();

        expect(textRenderer().getDefaultStyle().fontSize).toBe(12);
        expect(textRenderer().getExternalStyle().fontSize).toBe(11);
    });
});
