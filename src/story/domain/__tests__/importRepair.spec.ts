import { describe, expect, it } from "vitest";
import {
    needsPreV050Repair,
    normalizeIconNameWhitespace,
    pruneUnreferencedConnections,
    renameLegacyWorkObjectTypes,
    stripBpmnProperties,
} from "../importRepair";
import { ElementTypes } from "../elementTypes";
import { BusinessObject } from "../businessObject";

/** A shape that can be an edge endpoint. */
const shape = (id: string, type = ElementTypes.ACTOR + "Person") =>
    ({ id, type }) as unknown as BusinessObject;

/** An activity edge between two ids (either may be missing from the story). */
const activity = (id: string, source: string, target: string) =>
    ({
        id,
        type: ElementTypes.ACTIVITY,
        source,
        target,
    }) as unknown as BusinessObject;

/** An annotation edge — classified alongside activities, not as a shape. */
const annotationEdge = (id: string, source: string, target: string) =>
    ({
        id,
        type: ElementTypes.CONNECTION,
        source,
        target,
    }) as unknown as BusinessObject;

describe("pruneUnreferencedConnections", () => {
    it("keeps a complete story intact and reports nothing removed", () => {
        const elements = [
            shape("a"),
            shape("b"),
            activity("e1", "a", "b"),
            annotationEdge("e2", "b", "a"),
        ];

        const result = pruneUnreferencedConnections(elements);

        expect(result.elements).toEqual(elements);
        expect(result.removedConnections).toEqual([]);
    });

    it("drops a single dangling edge", () => {
        const dangling = activity("e1", "a", "missing");

        const result = pruneUnreferencedConnections([shape("a"), dangling]);

        expect(result.elements).toEqual([shape("a")]);
        expect(result.removedConnections).toEqual([dangling]);
    });

    // Regression lock for the `elements = elements.splice(i, 1)` bug: the old
    // implementation rebound its local to the removed item, so only the *first*
    // dangling edge was ever pruned and the rest reached addConnection with
    // undefined endpoints. This case fails on that code and passes on this one.
    it("drops every dangling edge, not just the first", () => {
        const first = activity("e1", "a", "gone1");
        const second = activity("e2", "a", "gone2");
        const third = annotationEdge("e3", "gone3", "a");

        const result = pruneUnreferencedConnections([
            shape("a"),
            first,
            second,
            third,
        ]);

        expect(result.elements).toEqual([shape("a")]);
        expect(result.removedConnections).toEqual([first, second, third]);
    });

    it.each([
        {
            position: "at index 0",
            elements: () => [activity("e1", "gone", "a"), shape("a")],
        },
        {
            position: "at the tail",
            elements: () => [shape("a"), activity("e1", "a", "gone")],
        },
    ])("prunes a dangling edge $position", ({ elements }) => {
        const result = pruneUnreferencedConnections(elements());

        expect(result.elements).toEqual([shape("a")]);
        expect(result.removedConnections).toHaveLength(1);
    });

    it.each([
        { broken: "source", edge: () => activity("e1", "gone", "a") },
        { broken: "target", edge: () => activity("e1", "a", "gone") },
        { broken: "both ends", edge: () => activity("e1", "gone", "away") },
    ])("prunes an edge with an unresolvable $broken", ({ edge }) => {
        const result = pruneUnreferencedConnections([shape("a"), edge()]);

        expect(result.removedConnections).toHaveLength(1);
    });

    // Only shapes are valid endpoints upstream and here: an edge chained onto
    // another edge's id would give diagram-js a connection to a connection.
    it("does not accept another edge as a valid endpoint", () => {
        const chained = activity("e2", "e1", "a");

        const result = pruneUnreferencedConnections([
            shape("a"),
            shape("b"),
            activity("e1", "a", "b"),
            chained,
        ]);

        expect(result.removedConnections).toEqual([chained]);
    });

    it("leaves the input array untouched", () => {
        const elements = [shape("a"), activity("e1", "a", "gone")];
        const snapshot = [...elements];

        pruneUnreferencedConnections(elements);

        expect(elements).toEqual(snapshot);
        expect(elements).toHaveLength(2);
    });
});

describe("renameLegacyWorkObjectTypes", () => {
    it.each([
        {
            from: ElementTypes.WORKOBJECT,
            to: `${ElementTypes.WORKOBJECT}Document`,
            why: "the unnamed default meant Document",
        },
        {
            from: `${ElementTypes.WORKOBJECT}Bubble`,
            to: `${ElementTypes.WORKOBJECT}Conversation`,
            why: "Bubble was renamed to Conversation",
        },
        {
            from: `${ElementTypes.WORKOBJECT}Document`,
            to: `${ElementTypes.WORKOBJECT}Document`,
            why: "already-current types must not be renamed twice",
        },
        {
            from: `${ElementTypes.ACTOR}Person`,
            to: `${ElementTypes.ACTOR}Person`,
            why: "actors are unaffected",
        },
        {
            from: ElementTypes.ACTIVITY,
            to: ElementTypes.ACTIVITY,
            why: "activities are unaffected",
        },
        {
            from: ElementTypes.GROUP,
            to: ElementTypes.GROUP,
            why: "groups are unaffected",
        },
    ])("maps $from to $to ($why)", ({ from, to }) => {
        const element = shape("a", from as ElementTypes);

        renameLegacyWorkObjectTypes([element]);

        expect(element.type).toBe(to);
    });

    it("returns the same array so call sites can pipeline", () => {
        const elements = [shape("a")];

        expect(renameLegacyWorkObjectTypes(elements)).toBe(elements);
    });
});

describe("normalizeIconNameWhitespace", () => {
    it.each([
        {
            from: "domainStory:workObject My Icon",
            to: "domainStory:workObject-My-Icon",
        },
        { from: "domainStory:actorMy Icon", to: "domainStory:actorMy-Icon" },
        { from: "domainStory:actorA  B", to: "domainStory:actorA--B" },
        { from: "domainStory:actorPerson", to: "domainStory:actorPerson" },
    ])("rewrites $from to $to", ({ from, to }) => {
        const element = shape("a", from as ElementTypes);

        normalizeIconNameWhitespace([element]);

        expect(element.type).toBe(to);
    });

    it("does not throw on an element without a type", () => {
        const untyped = { id: "a" } as unknown as BusinessObject;

        expect(() => normalizeIconNameWhitespace([untyped])).not.toThrow();
    });
});

describe("stripBpmnProperties", () => {
    it("removes $type, $descriptor and di from the serialized object", () => {
        const element = {
            ...shape("a"),
            $type: "domainStory:actor",
            $descriptor: { name: "x" },
            di: { id: "di_a" },
        } as unknown as BusinessObject;

        stripBpmnProperties([element]);

        expect(JSON.parse(JSON.stringify(element))).toEqual({
            id: "a",
            type: `${ElementTypes.ACTOR}Person`,
        });
        // `delete`, not `= undefined`: the key must be gone, so the spread into
        // the diagram-js attrs cannot shadow anything with `undefined`.
        expect("$type" in element).toBe(false);
    });

    it("leaves objects that never had them untouched", () => {
        const element = shape("a");

        stripBpmnProperties([element]);

        expect(element).toEqual({
            id: "a",
            type: `${ElementTypes.ACTOR}Person`,
        });
    });
});

describe("needsPreV050Repair", () => {
    it.each([
        { version: "0.4.0", expected: true, why: "clearly pre-v0.5.0" },
        { version: "0.5.0", expected: true, why: "the boundary is inclusive" },
        { version: "0.5.1", expected: true, why: "0.5.x still needs repair" },
        {
            version: "1.0.0",
            expected: false,
            why: "1.x already uses new names",
        },
        {
            version: "2.2.0",
            expected: false,
            why: "1.x already uses new names",
        },
        { version: "4.0.0", expected: false, why: "current format" },
        {
            version: "?",
            expected: true,
            why: "no declared version coerces to 0 — treat as ancient",
        },
        {
            version: "v1.0.0",
            expected: false,
            why: "a non-numeric prefix yields NaN, and NaN <= 0.5 is false",
        },
    ])("$version → $expected ($why)", ({ version, expected }) => {
        expect(needsPreV050Repair(version)).toBe(expected);
    });
});
