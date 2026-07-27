import { describe, expect, it } from "vitest";
import Canvas from "diagram-js/lib/core/Canvas";
import ElementFactory from "diagram-js/lib/core/ElementFactory";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import EventBus from "diagram-js/lib/core/EventBus";
import type {
    Connection,
    Label,
    Root,
    Shape,
} from "diagram-js/lib/model/Types";
import { DomainStoryImportService } from "../DomainStoryImportService";
import { ElementTypes } from "../../domain/elementTypes";
import { IconDictionaryService } from "../../../iconSet/service/IconDictionaryService";
import { IconSetImportExportService } from "../../../iconSet/service/IconSetImportExportService";
import type { IconStyleSheetPort } from "../../../iconSet/domain/ports/IconStyleSheetPort";
import { DomainStoryPropertiesService } from "../../../modeler/service/DomainStoryPropertiesService";

// The import path under test never renders, so CSS injection is irrelevant here
// (and with no style element configured the real injector no-ops anyway).
const noopStyleSheet: IconStyleSheetPort = { addIconStyle() {} };

/**
 * Recording stand-ins for the four diagram-js primitives the import service
 * touches. Nothing renders: the service only ever *adds* elements, so insertion
 * order, version gating and event sequencing are all directly observable from
 * the recorded calls. A browser test could only infer the order from the final
 * registry, which is why this lives in the fast tier (ADR 0013).
 */
function makeHarness() {
    const added: {
        kind: "shape" | "connection";
        id: string;
        parent?: string;
    }[] = [];
    const fired: { event: string; payload: unknown }[] = [];
    const created: { kind: string; attrs: any }[] = [];
    const byId = new Map<string, any>();
    const bannerCalls: string[] = [];

    const elementFactory = {
        create(kind: string, attrs: any) {
            created.push({ kind, attrs });
            // Spread rather than pass through: the service re-reads `.type` off
            // the created shape for group parenting and `.id` via the registry,
            // so the fake must behave like a distinct element object.
            const element = { ...attrs };
            byId.set(element.id, element);
            return element;
        },
    } as unknown as ElementFactory<Connection, Label, Root, Shape>;

    const canvas = {
        addShape(shape: any, parent?: any) {
            added.push({ kind: "shape", id: shape.id, parent: parent?.id });
            return shape;
        },
        addConnection(connection: any) {
            added.push({ kind: "connection", id: connection.id });
            return connection;
        },
    } as unknown as Canvas;

    const elementRegistry = {
        get: (id: string) => byId.get(id),
    } as unknown as ElementRegistry;

    const eventBus = {
        fire(event: string, payload: unknown) {
            fired.push({ event, payload });
        },
    } as unknown as EventBus;

    const iconDictionaryService = new IconDictionaryService(noopStyleSheet);
    const iconSetService = new IconSetImportExportService(
        iconDictionaryService,
    );
    const propertiesService = new DomainStoryPropertiesService();

    // Argument order must track DomainStoryImportService.$inject.
    const service = new DomainStoryImportService(
        eventBus,
        canvas,
        elementRegistry,
        elementFactory,
        iconDictionaryService,
        iconSetService,
        propertiesService,
        { show: (version: string) => bannerCalls.push(version) },
    );

    return {
        service,
        added,
        fired,
        created,
        bannerCalls,
        propertiesService,
        /** `"shape:id"` / `"connection:id"` in the order the canvas saw them. */
        addedSignature: () => added.map((call) => `${call.kind}:${call.id}`),
    };
}

const ICON_SET = {
    name: "default",
    actors: { Person: "<svg/>", Group: "<svg/>" },
    workObjects: { Document: "<svg/>", Call: "<svg/>" },
};

/** Serializes a v4 export file; `story` overrides the `domainStory` fields. */
function storyFile(businessObjects: any[], story: Record<string, any> = {}) {
    return JSON.stringify({
        iconSet: ICON_SET,
        domainStory: {
            businessObjects,
            version: "4.0.0",
            title: "",
            description: "",
            ...story,
        },
    });
}

const actor = (id: string, extra: Record<string, any> = {}) => ({
    id,
    type: `${ElementTypes.ACTOR}Person`,
    name: id,
    x: 0,
    y: 0,
    ...extra,
});

const workObject = (id: string, extra: Record<string, any> = {}) => ({
    id,
    type: `${ElementTypes.WORKOBJECT}Document`,
    name: id,
    x: 0,
    y: 0,
    ...extra,
});

const group = (id: string, extra: Record<string, any> = {}) => ({
    id,
    type: ElementTypes.GROUP,
    name: id,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    ...extra,
});

const activity = (id: string, source: string, target: string) => ({
    id,
    type: ElementTypes.ACTIVITY,
    name: id,
    source,
    target,
    number: 1,
    waypoints: [{ x: 0, y: 0 }],
});

describe("DomainStoryImportService insertion order", () => {
    // Deliberately shuffled input: a service that simply iterated the document
    // would emit activity → actor → group → workObject and fail here.
    it("adds the group first, then the remaining shapes, then the connections", () => {
        const harness = makeHarness();

        harness.service.import(
            storyFile([
                activity("connection_1", "shape_actor", "shape_work"),
                actor("shape_actor"),
                group("shape_group"),
                workObject("shape_work"),
            ]),
        );

        expect(harness.addedSignature()).toEqual([
            "shape:shape_group",
            "shape:shape_actor",
            "shape:shape_work",
            "connection:connection_1",
        ]);
    });

    it("parents a group child onto the group shape without a parentIndex", () => {
        const harness = makeHarness();

        harness.service.import(
            storyFile([
                group("shape_group"),
                actor("shape_actor", { parent: "shape_group" }),
            ]),
        );

        expect(harness.added).toEqual([
            { kind: "shape", id: "shape_group", parent: undefined },
            { kind: "shape", id: "shape_actor", parent: "shape_group" },
        ]);
    });

    it("resolves connection endpoints through the element registry", () => {
        const harness = makeHarness();

        harness.service.import(
            storyFile([
                actor("shape_actor"),
                workObject("shape_work"),
                activity("connection_1", "shape_actor", "shape_work"),
            ]),
        );

        const connection = harness.created.find(
            (call) => call.kind === "connection",
        )!;
        expect(connection.attrs.source.id).toBe("shape_actor");
        expect(connection.attrs.target.id).toBe("shape_work");
    });
});

describe("DomainStoryImportService version gating", () => {
    // Behavioral, not spy-based: feed both legacy work-object spellings and read
    // back the type the element factory was handed.
    const LEGACY_WORK_OBJECTS = [
        workObject("shape_bare", { type: ElementTypes.WORKOBJECT }),
        workObject("shape_bubble", {
            type: `${ElementTypes.WORKOBJECT}Bubble`,
        }),
    ];

    it.each([
        { version: "0.4.0", repaired: true },
        { version: "0.5.0", repaired: true },
        { version: "0.5.1", repaired: true },
        { version: "1.0.0", repaired: false },
        { version: "2.2.0", repaired: false },
        { version: "4.0.0", repaired: false },
        { version: "?", repaired: true },
        { version: "v1.0.0", repaired: false },
    ])(
        "version $version renames legacy work objects: $repaired",
        ({ version, repaired }) => {
            const harness = makeHarness();

            harness.service.import(
                storyFile(structuredClone(LEGACY_WORK_OBJECTS), { version }),
            );

            const types = harness.created.map((call) => call.attrs.type);
            expect(types).toEqual(
                repaired
                    ? [
                          `${ElementTypes.WORKOBJECT}Document`,
                          `${ElementTypes.WORKOBJECT}Conversation`,
                      ]
                    : [
                          ElementTypes.WORKOBJECT,
                          `${ElementTypes.WORKOBJECT}Bubble`,
                      ],
            );
            // The banner is unconditional and always shows the raw string —
            // including "?" — so the user sees what the file actually declared.
            expect(harness.bannerCalls).toEqual([version]);
        },
    );
});

describe("DomainStoryImportService canvas lifecycle", () => {
    it("clears the diagram before adding anything", () => {
        const harness = makeHarness();

        harness.service.import(storyFile([actor("shape_actor")]));

        expect(harness.fired[0].event).toBe("diagram.clear");
        expect(harness.added).toHaveLength(1);
    });

    // The contract ADR 0007 promises: parsing happens first, so a host handing
    // over a wrong file cannot wipe the user's current diagram.
    it.each([
        { what: "an unrecognized payload", story: '{"foo":1}' },
        { what: "a non-story array", story: '"not a story"' },
        { what: "invalid JSON", story: "{" },
    ])("throws on $what before firing diagram.clear", ({ story }) => {
        const harness = makeHarness();

        expect(() => harness.service.import(story)).toThrow();
        expect(harness.fired).toEqual([]);
        expect(harness.added).toEqual([]);
    });

    it("strips parent/children from every business object and stores the metadata", () => {
        const harness = makeHarness();
        const scope = {
            granularity: "coarse-grained",
            pointInTime: "to-be",
            domainPurity: "digitalized",
        };

        harness.service.import(
            storyFile(
                [
                    group("shape_group", { children: ["shape_actor"] }),
                    actor("shape_actor", { parent: "shape_group" }),
                ],
                {
                    title: "T",
                    description: "D",
                    scope,
                    version: "4.0.0",
                },
            ),
        );

        for (const call of harness.created) {
            expect("parent" in call.attrs.businessObject).toBe(false);
            expect("children" in call.attrs.businessObject).toBe(false);
        }
        expect(harness.propertiesService.getTitle()).toBe("T");
        expect(harness.propertiesService.getDescription()).toBe("D");
        expect(harness.propertiesService.getScope()).toEqual(scope);
        expect(harness.propertiesService.getVersion()).toBe("4.0.0");
    });
});

describe("DomainStoryImportService repair signalling", () => {
    it("fires dst.import.repaired with every dropped edge", () => {
        const harness = makeHarness();

        harness.service.import(
            storyFile([
                actor("shape_actor"),
                activity("connection_1", "shape_actor", "shape_gone"),
                activity("connection_2", "shape_missing", "shape_actor"),
            ]),
        );

        const repaired = harness.fired.filter(
            (call) => call.event === "dst.import.repaired",
        );
        expect(repaired).toHaveLength(1);
        expect(
            (repaired[0].payload as any).removedConnections.map(
                (bo: any) => bo.id,
            ),
        ).toEqual(["connection_1", "connection_2"]);
        // Both dangling edges are gone — the old splice loop kept the second.
        expect(harness.addedSignature()).toEqual(["shape:shape_actor"]);
    });

    it("does not fire dst.import.repaired for a complete story", () => {
        const harness = makeHarness();

        harness.service.import(
            storyFile([
                actor("shape_actor"),
                workObject("shape_work"),
                activity("connection_1", "shape_actor", "shape_work"),
            ]),
        );

        expect(
            harness.fired.some((call) => call.event === "dst.import.repaired"),
        ).toBe(false);
    });
});

describe("DomainStoryImportService repeated imports", () => {
    // Regression lock for the never-cleared group map: the second story declares
    // a `parent` whose group it does not contain (a shape the first import's
    // `diagram.clear` already destroyed). The old code found the stale shape and
    // parented onto it; a fresh instance has nothing to find and adds at top
    // level, which is the only correct answer.
    it("never parents onto a group destroyed by a previous import", () => {
        const withGroup = storyFile([
            group("shape_group"),
            actor("shape_actor", { parent: "shape_group" }),
        ]);
        const danglingParent = storyFile([
            actor("shape_actor", { parent: "shape_group" }),
        ]);

        const reused = makeHarness();
        reused.service.import(withGroup);
        reused.added.length = 0;
        reused.service.import(danglingParent);

        const fresh = makeHarness();
        fresh.service.import(danglingParent);

        expect(reused.added).toEqual([
            { kind: "shape", id: "shape_actor", parent: undefined },
        ]);
        expect(reused.added).toEqual(fresh.added);
    });

    it("re-importing the same document twice yields the same canvas calls", () => {
        const document = () =>
            storyFile([
                group("shape_group"),
                actor("shape_actor", { parent: "shape_group" }),
                workObject("shape_work"),
                activity("connection_1", "shape_actor", "shape_work"),
            ]);

        const reused = makeHarness();
        reused.service.import(document());
        const firstRun = [...reused.added];
        reused.added.length = 0;
        reused.service.import(document());

        expect(reused.added).toEqual(firstRun);
    });
});
