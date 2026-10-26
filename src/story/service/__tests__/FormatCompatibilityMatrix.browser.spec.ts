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
 * Every historical Egon.io export shape, imported into a real diagram-js canvas
 * and exported again. The unit specs stop short of the canvas (factory
 * defaults, group parenting, renderer, live registry), and diagram-js measures
 * SVG with `getBBox`, which jsdom returns as zero, so this needs a browser
 * (ADR TST-1).
 *
 * File compatibility with the WPS web app is the core invariant (ADR DOC-1):
 * each row must come back byte-identical except for {@link CANONICALIZED_AWAY}.
 * A red row is a finding, not a reason to loosen an expectation.
 * `egn_cinema_story.egn.json` is covered by `EgonClientBoot.browser.spec.ts`.
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
 * Re-decodes the raw JSON instead of calling `parseExportFile`, so a parser bug
 * cannot make the comparison pass vacuously.
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

/** What must hold for every row. */
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

    // No dangling edge survived.
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

    // Group membership persists through `parent`; the inverse `children` is
    // diagram-js-owned and never serialized.
    for (const bo of businessObjects) {
        for (const key of CANONICALIZED_AWAY) {
            expect(bo, `${bo.id} must not carry ${key}`).not.toHaveProperty(
                key,
            );
        }
        // No {info}/{version} trailer object leaked through.
        expect(bo.type).toBeTypeOf("string");
    }

    // The element factory's 75×75 default must stay out of the persisted model.
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

    // Guarded because a failed boot leaves `diagram` unset.
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

            // Derived from the fixture, never hand-written, so a coordinate
            // typo cannot silently pass.
            expect(exported.domainStory.businessObjects).toEqual(
                expectedBusinessObjects(importFixture<any>(file)),
            );
        },
    );
});
