import { afterEach, describe, expect, it } from "vitest";
import {
    createTestDiagram,
    type TestDiagram,
} from "../../__tests__/helpers/createTestDiagram";
import { importFixture } from "../../__tests__/helpers/importFixture";
import type { DomainStoryDocument } from "../../story/domain/DomainStoryDocument";

/**
 * Browser-tier smoke test — the proof the whole harness works end to end.
 *
 * It boots a real EgonClient in chromium (jsdom cannot, because diagram-js
 * measures SVG via `getBBox`, which jsdom returns as zero) and drives an
 * import, exercising the shared helpers, the fixture registry, and the browser
 * project together. If this stays green, the dependent tier issues can build on
 * a bootstrap that is known to render.
 */
describe("EgonClient boot (browser)", () => {
    let diagram: TestDiagram | undefined;

    // Tear down after every case so canvases and their DOM don't leak across
    // the run; guarded because a failed boot may leave `diagram` unset.
    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    it("renders a diagram-js canvas into the container", async () => {
        diagram = await createTestDiagram();

        expect(diagram.container.querySelector("svg")).not.toBeNull();
    });

    it("imports a story fixture and renders its elements", async () => {
        diagram = await createTestDiagram();
        const cinema = importFixture<DomainStoryDocument>(
            "egn_cinema_story.egn.json",
        );

        diagram.client.import(cinema);

        // Every imported business object is drawn as a diagram-js element group
        // (diagram-js stamps each with `data-element-id`).
        const rendered =
            diagram.container.querySelectorAll("[data-element-id]");
        expect(rendered.length).toBeGreaterThan(0);

        // The model also round-trips back out through the live element registry.
        const exported = diagram.client.export();
        expect(exported.domainStory.businessObjects.length).toBeGreaterThan(0);
    });
});
