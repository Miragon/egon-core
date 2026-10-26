import { afterEach, describe, expect, it } from "vitest";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import type { DomainStoryTextRenderer } from "../DomainStoryTextRenderer";

/**
 * Proves the config path from `EgonClientConfig.textRenderer` to didi's
 * `config.textRenderer`, whose string keys the compiler cannot check.
 *
 * Browser tier (ADR TST-2): the production adapter's render pass needs `getBBox`.
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
        expect(textRenderer().getExternalStyle().fontSize).toBe(19);
    });

    it("falls back to the built-in defaults when the host configures nothing", () => {
        modeler = createTestModeler();

        expect(textRenderer().getDefaultStyle().fontSize).toBe(12);
        expect(textRenderer().getExternalStyle().fontSize).toBe(11);
    });
});
