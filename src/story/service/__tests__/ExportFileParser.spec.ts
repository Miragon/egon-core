import { describe, expect, it } from "vitest";
import {
    extractDomainStory,
    extractIconSetConfiguration,
    parseExportFile,
    validateRetainedGeometry,
} from "../ExportFileParser";
import { importFixture } from "../../../__tests__/helpers/importFixture";

/**
 * Legacy `.dst` fixtures. `stringPayload` marks the v1.x files whose `domain`
 * and `dst` are JSON *strings* — the shape that crashed the previous importer.
 */
const LEGACY_FIXTURES = [
    {
        file: "dst_export_version_1_0_0.json",
        version: "1.0.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_1_1_0.json",
        version: "1.1.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_1_2_0.json",
        version: "1.2.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_1_3_0.json",
        version: "1.3.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_1_4_0.json",
        version: "1.4.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_1_5_0.json",
        version: "1.5.0",
        stringPayload: true,
    },
    {
        file: "dst_export_version_2_2_0.json",
        version: "2.2.0",
        stringPayload: false,
    },
] as const;

describe("import compatibility across historical formats", () => {
    it.each(LEGACY_FIXTURES)(
        "normalizes legacy $file into 13 objects, version $version, and a decoded icon set",
        ({ file, version }) => {
            const { domainStory, iconSetConfiguration } = parseExportFile(
                importFixture(file),
            );

            expect(domainStory.businessObjects).toHaveLength(13);
            expect(domainStory.version).toBe(version);
            expect(domainStory.description).toBe(`version ${version}`);
            expect(domainStory.title).toBe("");
            expect(domainStory.scope).toBeUndefined();
            // the {info}/{version} trailer is stripped: every kept element typed
            expect(
                domainStory.businessObjects.every((bo: any) => "type" in bo),
            ).toBe(true);

            // the icon set is decoded to a real object (not a raw string)
            expect(iconSetConfiguration).toBeDefined();
            expect(iconSetConfiguration!.name).toBe("default");
            expect(Object.keys(iconSetConfiguration!.actors)).toHaveLength(3);
            expect(Object.keys(iconSetConfiguration!.workObjects)).toHaveLength(
                6,
            );
        },
    );

    it("parses the v4.0.0 format including title, description, and scope", () => {
        const { domainStory, iconSetConfiguration } = parseExportFile(
            importFixture("egn_export_version_4_0_0.json"),
        );

        expect(domainStory.businessObjects).toHaveLength(13);
        expect(domainStory.version).toBe("4.0.0");
        expect(domainStory.title).toBe("testTitle");
        expect(domainStory.description).toBe(
            "version 4.0.0 (implement new DomainStory model)",
        );
        expect(domainStory.scope).toEqual({
            granularity: "coarse-grained",
            pointInTime: "to-be",
            domainPurity: "digitalized",
        });
        expect(iconSetConfiguration!.name).toBe("default");
    });

    // The hand-authored cinema story is shared harness fixture data; parsing it
    // here is its executable contract — if the parser ever rejects it, the
    // browser smoke test that imports it would fail for an unrelated reason.
    it("accepts the hand-authored cinema story fixture", () => {
        const { domainStory, iconSetConfiguration } = parseExportFile(
            importFixture("egn_cinema_story.egn.json"),
        );

        expect(domainStory.businessObjects).toHaveLength(7);
        expect(domainStory.version).toBe("4.0.0");
        expect(domainStory.title).toBe("Cinema");
        expect(domainStory.scope).toEqual({
            granularity: "coarse-grained",
            pointInTime: "to-be",
            domainPurity: "digitalized",
        });
        expect(iconSetConfiguration!.name).toBe("default");
        expect(Object.keys(iconSetConfiguration!.actors)).toHaveLength(3);
        expect(Object.keys(iconSetConfiguration!.workObjects)).toHaveLength(6);
    });

    it("no longer throws on v1.x string payloads (regression for the raw-passthrough crash)", () => {
        for (const { file } of LEGACY_FIXTURES.filter(
            (fixture) => fixture.stringPayload,
        )) {
            expect(() => parseExportFile(importFixture(file))).not.toThrow();
        }
    });
});

describe("extractDomainStory", () => {
    it("prefers the v4 domainStory over a legacy dst when both are present", () => {
        const story = extractDomainStory({
            domainStory: {
                businessObjects: [{ type: "a", id: "1" }],
                version: "4.0.0",
                title: "T",
                description: "D",
            },
            dst: [{ type: "x", id: "9" }],
        });

        expect(story.version).toBe("4.0.0");
        expect(story.businessObjects).toEqual([{ type: "a", id: "1" }]);
    });

    it("decodes a stringified dst array (v1.x) and captures its trailer", () => {
        const dst = JSON.stringify([
            { type: "actor", id: "1" },
            { info: "desc" },
            { version: "1.2.0" },
        ]);

        const story = extractDomainStory({ dst });

        expect(story.businessObjects).toEqual([{ type: "actor", id: "1" }]);
        expect(story.description).toBe("desc");
        expect(story.version).toBe("1.2.0");
    });

    it("captures the {info} and {version} trailer from an object dst array", () => {
        const story = extractDomainStory({
            dst: [
                { type: "actor", id: "1" },
                { info: "hello" },
                { version: "2.0.0" },
            ],
        });

        expect(story.businessObjects).toHaveLength(1);
        expect(story.description).toBe("hello");
        expect(story.version).toBe("2.0.0");
    });

    it("reads a bare top-level array (oldest legacy format)", () => {
        const story = extractDomainStory([
            { type: "actor", id: "1" },
            { version: "0.4.0" },
            { info: "old" },
        ]);

        expect(story.businessObjects).toHaveLength(1);
        expect(story.version).toBe("0.4.0");
        expect(story.description).toBe("old");
    });

    it("yields a well-formed empty story for legitimately empty files", () => {
        const emptyShapes = [
            { dst: [] },
            { domainStory: { businessObjects: [] } },
            [],
        ];

        for (const parsed of emptyShapes) {
            const story = extractDomainStory(parsed);

            expect(story.businessObjects).toEqual([]);
            expect(story.version).toBe("?");
            expect(story.title).toBe("");
            expect(story.description).toBe("");
        }
    });

    it("rejects payloads matching no known shape instead of yielding an empty story", () => {
        // a silent empty story would let the importer clear the canvas after
        // a host passes a wrong file
        const unrecognizedPayloads = [
            {},
            { foo: 1 },
            "not a story",
            42,
            null,
            { domainStory: { title: "businessObjects missing" } },
            { dst: '{"not":"an array"}' },
        ];

        for (const parsed of unrecognizedPayloads) {
            expect(() => extractDomainStory(parsed)).toThrow(
                /Unrecognized domain story file/,
            );
        }
    });
});

describe("extractIconSetConfiguration", () => {
    it("reads the v4 iconSet object as-is", () => {
        const config = extractIconSetConfiguration({
            iconSet: { name: "n", actors: {}, workObjects: {} },
        });

        expect(config).toEqual({ name: "n", actors: {}, workObjects: {} });
    });

    it("decodes a stringified legacy domain instead of passing it through raw", () => {
        const domain = JSON.stringify({
            name: "d",
            actors: { A: "<svg/>" },
            workObjects: {},
        });

        expect(extractIconSetConfiguration({ domain })).toEqual({
            name: "d",
            actors: { A: "<svg/>" },
            workObjects: {},
        });
    });

    it("decodes the oldest key, a stringified `config`", () => {
        // `{ config, dst }` is the original export shape. Ignoring `config`
        // imported these files with no icons at all, and the next export wrote
        // the empty set back over them.
        const parsed = {
            config: JSON.stringify({
                name: "c",
                actors: { Person: "<svg/>" },
                workObjects: { Document: "<svg/>" },
            }),
            dst: [{ type: "domainStory:actorPerson" }],
        };

        expect(extractIconSetConfiguration(parsed)).toEqual({
            name: "c",
            actors: { Person: "<svg/>" },
            workObjects: { Document: "<svg/>" },
        });
    });

    it("reads an object-valued `config` as-is", () => {
        const config = { name: "c", actors: {}, workObjects: {} };

        expect(extractIconSetConfiguration({ config })).toEqual(config);
    });

    it("prefers iconSet over domain, and domain over config", () => {
        expect(
            extractIconSetConfiguration({
                iconSet: { name: "new", actors: {}, workObjects: {} },
                domain: '{"name":"old","actors":{},"workObjects":{}}',
                config: '{"name":"oldest","actors":{},"workObjects":{}}',
            })!.name,
        ).toBe("new");

        expect(
            extractIconSetConfiguration({
                domain: '{"name":"old","actors":{},"workObjects":{}}',
                config: '{"name":"oldest","actors":{},"workObjects":{}}',
            })!.name,
        ).toBe("old");
    });

    it("returns undefined when no icon-set key is present", () => {
        expect(extractIconSetConfiguration([{ type: "a" }])).toBeUndefined();
        expect(extractIconSetConfiguration({})).toBeUndefined();
    });
});

describe("untrusted import validation", () => {
    const valid = (): any => ({
        iconSet: { name: "test", actors: {}, workObjects: {} },
        domainStory: {
            title: "title",
            description: "description",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "shape_1",
                    type: "domainStory:actorPerson",
                    name: "actor",
                    x: 10,
                    y: 20,
                },
                {
                    id: "shape_2",
                    type: "domainStory:workObjectDocument",
                    name: "document",
                    x: 100,
                    y: 20,
                },
                {
                    id: "connection_1",
                    type: "domainStory:activity",
                    name: "does",
                    source: "shape_1",
                    target: "shape_2",
                    waypoints: [
                        { x: 20, y: 30 },
                        { x: 100, y: 30 },
                    ],
                },
            ],
        },
    });

    it("rejects duplicate and reserved ids before any repair can hide them", () => {
        const duplicate = valid();
        duplicate.domainStory.businessObjects[1].id = "shape_1";
        expect(() => parseExportFile(duplicate)).toThrow(/shape_1.*duplicate/i);

        const reserved = valid();
        reserved.domainStory.businessObjects[0].id = "__implicitroot_0";
        expect(() => parseExportFile(reserved)).toThrow(
            /__implicitroot_0.*reserved/i,
        );
    });

    it("rejects unsupported families and malformed rendering fields with an element id", () => {
        const family = valid();
        family.domainStory.businessObjects[0].type = "domainStory:surprise";
        expect(() => parseExportFile(family)).toThrow(
            /shape_1.*unsupported element family/i,
        );

        const coordinate = valid();
        coordinate.domainStory.businessObjects[0].x = Number.NaN;
        expect(() => parseExportFile(coordinate)).toThrow(
            /shape_1.*\.x.*finite number/i,
        );

        const dimension = valid();
        dimension.domainStory.businessObjects[0].width = 0;
        expect(() => parseExportFile(dimension)).toThrow(
            /shape_1.*\.width.*positive number/i,
        );
    });

    it("rejects malformed metadata, scope values, icon dictionaries, and icon sources", () => {
        const metadata = valid() as any;
        metadata.domainStory.title = 42;
        expect(() => parseExportFile(metadata)).toThrow(
            /domainStory\.title.*string/i,
        );

        const scope = valid() as any;
        scope.domainStory.scope = { pointInTime: "eventually" };
        expect(() => parseExportFile(scope)).toThrow(
            /scope\.pointInTime.*invalid/i,
        );

        const dictionary = valid() as any;
        dictionary.iconSet.actors = [];
        expect(() => parseExportFile(dictionary)).toThrow(
            /iconSet\.actors.*object/i,
        );

        const source = valid() as any;
        source.iconSet.actors = { Person: 17 };
        expect(() => parseExportFile(source)).toThrow(
            /iconSet\.actors.*Person.*string/i,
        );
    });

    it("validates retained waypoint geometry but permits malformed dangling edges to be repaired", () => {
        const malformed = valid() as any;
        malformed.domainStory.businessObjects[2].waypoints = [{ x: 1, y: 2 }];
        const parsed = parseExportFile(malformed);
        expect(() =>
            validateRetainedGeometry(parsed.domainStory.businessObjects),
        ).toThrow(/connection_1.*at least two waypoints/i);

        malformed.domainStory.businessObjects[2].target = "missing";
        const dangling = parseExportFile(malformed);
        expect(dangling.domainStory.businessObjects).toHaveLength(3);
    });

    it("drops imported diagram-js bookkeeping while preserving compatible business data", () => {
        const document = valid() as any;
        Object.assign(document.domainStory.businessObjects[0], {
            get: "hostile",
            set: "hostile",
            $instanceOf: "hostile",
            labels: ["hostile"],
            businessData: { owner: "team" },
        });

        const element = parseExportFile(document).domainStory
            .businessObjects[0] as any;
        expect(element).not.toHaveProperty("get");
        expect(element).not.toHaveProperty("set");
        expect(element).not.toHaveProperty("$instanceOf");
        expect(element).not.toHaveProperty("labels");
        expect(element.businessData).toEqual({ owner: "team" });
    });
});
