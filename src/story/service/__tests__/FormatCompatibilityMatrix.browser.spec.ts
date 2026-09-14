import { afterEach, describe, expect, it } from "vitest";
import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import {
    importFixture,
    type FixtureName,
} from "../../../__tests__/helpers/importFixture";
import type { DomainStoryDocument } from "../../domain/DomainStoryDocument";

/**
 * Level-2 format compatibility matrix: every historical Egon.io export shape,
 * imported into a *real* diagram-js canvas and exported again.
 *
 * WHY this tier: `ExportFileParser.spec.ts` already pins the decode step and
 * `DomainStoryRoundTrip.spec.ts` pins open→save with the element registry
 * stubbed. Neither proves a historical file survives the trip *through the
 * canvas* — element factory defaults, group parenting, the renderer and the live
 * element registry all sit on that path. Only a browser can run it: diagram-js
 * lays out by measuring SVG with `getBBox`, which jsdom returns as zero
 * (ADR 0013).
 *
 * File compatibility with the WPS web app is this library's most important
 * invariant (ADR 0007), so the assertions are deliberately strict: converging on
 * canonical v4.0.0 is asserted for all eight rows, and each row's business
 * objects must come back byte-identical to the fixture's own modulo the
 * documented canonicalizations. A red row here is a finding, not a reason to
 * loosen an expectation. Since #65 the renderer no longer writes to the model,
 * so the per-row comparison allows no render-time drift at all — the only
 * permitted difference is {@link CANONICALIZED_AWAY}.
 *
 * `egn_cinema_story.egn.json` is excluded on purpose: it encodes a different,
 * smaller story and is already covered by `EgonClientBoot.browser.spec.ts`.
 */

/** The ids all eight fixtures share, in the order export emits them. */
const CANONICAL_IDS = [
    "connection_5930",
    "connection_6348",
    "connection_8014",
    "connection_8064",
    "connection_8174",
    "connection_8994",
    "shape_0469",
    "shape_0798",
    "shape_1683",
    "shape_2543",
    "shape_5496",
    "shape_5871",
    "shape_8939",
] as const;

/** The same 13 elements in every fixture — only geometry and names differ. */
const CANONICAL_TYPES: Record<string, string> = {
    connection_5930: "domainStory:activity",
    connection_6348: "domainStory:activity",
    connection_8014: "domainStory:activity",
    connection_8064: "domainStory:activity",
    connection_8174: "domainStory:activity",
    connection_8994: "domainStory:activity",
    shape_0469: "domainStory:workObjectCall",
    shape_0798: "domainStory:workObjectDocument",
    shape_1683: "domainStory:group",
    shape_2543: "domainStory:actorPerson",
    shape_5496: "domainStory:actorPerson",
    shape_5871: "domainStory:workObjectFolder",
    shape_8939: "domainStory:actorGroup",
};

const CANONICAL_ACTOR_ICONS = ["Group", "Person", "System"];
const CANONICAL_WORK_OBJECT_ICONS = [
    "Call",
    "Conversation",
    "Document",
    "Email",
    "Folder",
    "Info",
];

/** The only element carrying persisted dimensions: the group. */
const SIZED_ELEMENT_ID = "shape_1683";

/** Keys import canonicalizes away and export must never re-stamp. */
const CANONICALIZED_AWAY = ["$type", "$descriptor", "di", "children"] as const;

interface MatrixRow {
    file: FixtureName;
    /** The version the file declares — every row still exports as 4.0.0. */
    version: string;
    title: string;
    description: string;
    scope: Record<string, string> | undefined;
}

const MATRIX: readonly MatrixRow[] = [
    ...(
        ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "2.2.0"] as const
    ).map((version) => ({
        // Legacy files smuggle metadata in as an `{info}` trailer; there is no
        // title on disk (upstream derives it from the filename, a host concern).
        file: `dst_export_version_${version.replace(/\./g, "_")}.json` as FixtureName,
        version,
        title: "",
        description: `version ${version}`,
        scope: undefined,
    })),
    {
        file: "egn_export_version_4_0_0.json",
        version: "4.0.0",
        title: "testTitle",
        description: "version 4.0.0 (implement new DomainStory model)",
        scope: {
            granularity: "coarse-grained",
            pointInTime: "to-be",
            domainPurity: "digitalized",
        },
    },
];

/**
 * The canonical form of a fixture's own business objects.
 *
 * Deliberately re-decodes the raw JSON instead of calling `parseExportFile`, so
 * the matrix is an independent oracle: a parser bug that `ExportFileParser.spec`
 * also missed cannot make this comparison pass vacuously.
 */
function expectedBusinessObjects(fixture: any) {
    let raw = fixture.domainStory ?? fixture.dst;
    if (typeof raw === "string") {
        raw = JSON.parse(raw); // v1.x wrote the story as a JSON string
    }
    const elements = Array.isArray(raw) ? raw : raw.businessObjects;
    return elements
        .filter((element: any) => "type" in element) // drop the {info}/{version} trailer
        .map((element: any) =>
            Object.fromEntries(
                Object.entries(element).filter(
                    ([key]) => !CANONICALIZED_AWAY.includes(key as never),
                ),
            ),
        )
        .sort((a: any, b: any) => a.id.localeCompare(b.id));
}

/**
 * Everything that must hold for *every* row: the shape of a canonical v4.0.0
 * export, rendered from a real canvas.
 */
function expectCanonical(exported: any, container: HTMLElement) {
    expect(Object.keys(exported)).toEqual(["iconSet", "domainStory"]);
    expect(exported.domainStory.version).toBe("4.0.0");

    expect(exported.iconSet.name).toBe("default");
    expect(Object.keys(exported.iconSet.actors).sort()).toEqual(
        CANONICAL_ACTOR_ICONS,
    );
    expect(Object.keys(exported.iconSet.workObjects).sort()).toEqual(
        CANONICAL_WORK_OBJECT_ICONS,
    );

    const businessObjects = exported.domainStory.businessObjects;
    expect(businessObjects).toHaveLength(CANONICAL_IDS.length);

    const ids = businessObjects.map((bo: any) => bo.id);
    expect(ids).toEqual([...CANONICAL_IDS]);

    const typeById = Object.fromEntries(
        businessObjects.map((bo: any) => [bo.id, bo.type]),
    );
    expect(typeById).toEqual(CANONICAL_TYPES);

    // No dangling edge survived: every endpoint resolves to a present shape.
    const shapeIds = new Set(
        businessObjects
            .filter((bo: any) => !bo.type.startsWith("domainStory:activity"))
            .map((bo: any) => bo.id),
    );
    for (const edge of businessObjects.filter((bo: any) =>
        bo.type.startsWith("domainStory:activity"),
    )) {
        expect(shapeIds.has(edge.source)).toBe(true);
        expect(shapeIds.has(edge.target)).toBe(true);
    }

    // BPMN moddle leftovers that 1.3.0+ files carry are stripped. Group
    // membership persists through `parent`; only its live inverse `children`
    // collection is diagram-js-owned and never serialized.
    for (const bo of businessObjects) {
        for (const key of CANONICALIZED_AWAY) {
            expect(bo, `${bo.id} must not carry ${key}`).not.toHaveProperty(
                key,
            );
        }
        // Nothing untyped leaked through — no {info}/{version} trailer object.
        expect(bo.type).toBeTypeOf("string");
    }

    // Locks that the element factory's 75×75 default lands in the diagram-js
    // attrs only, never in the persisted model.
    expect(
        businessObjects
            .filter(
                (bo: any) => bo.width !== undefined || bo.height !== undefined,
            )
            .map((bo: any) => bo.id),
    ).toEqual([SIZED_ELEMENT_ID]);

    // It really rendered — not merely parsed into the registry.
    expect(
        container.querySelectorAll("[data-element-id]").length,
    ).toBeGreaterThanOrEqual(CANONICAL_IDS.length);
}

describe("format compatibility matrix (browser)", () => {
    let diagram: TestDiagram | undefined;

    // One fresh diagram per row, torn down afterwards so canvases and their DOM
    // don't leak across the run; guarded because a failed boot leaves it unset.
    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    it.each(MATRIX)(
        "imports $file and exports canonical v4.0.0",
        async ({ file, title, description, scope }) => {
            diagram = await createTestDiagram();
            const fixture = importFixture<any>(file);

            diagram.client.import(fixture as DomainStoryDocument);
            const exported: any = diagram.client.export();

            expectCanonical(exported, diagram.container);

            expect(exported.domainStory.title).toBe(title);
            expect(exported.domainStory.description).toBe(description);
            expect(exported.domainStory.scope).toEqual(scope);

            // Per-fixture fidelity: x/y/name/pickedColor/waypoints/number all
            // survive the canvas verbatim. Derived from the fixture, never
            // hand-written, so a coordinate typo cannot silently pass.
            expect(exported.domainStory.businessObjects).toEqual(
                expectedBusinessObjects(importFixture<any>(file)),
            );
        },
    );
});
