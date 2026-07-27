import { describe, expect, it } from "vitest";
import {
    needsPreV050Repair,
    normalizeIconNameWhitespace,
    numberActivitiesFromActors,
    pruneUnreferencedConnections,
    renameLegacyWorkObjectTypes,
    stripBpmnProperties,
    useLegacyAnnotationNumberAsHeight,
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

/**
 * The two repairs #74 moved off the render pass.
 *
 * Both used to happen on *every repaint* inside `DomainStoryRenderer`: the
 * annotation height was smuggled through `businessObject.number`, and a missing
 * activity number was minted in `renderExternalNumber`. Import runs no command,
 * so without these a hand-made or pre-#74 file would open degraded.
 */

/** An annotation business object, optionally carrying the legacy fields. */
const annotation = (id: string, extra: Record<string, unknown> = {}) =>
    ({
        id,
        type: ElementTypes.TEXTANNOTATION,
        ...extra,
    }) as unknown as BusinessObject;

/** An actor-sourced activity, i.e. a numbered story step. */
const step = (
    id: string,
    source: string,
    number?: number | null,
): BusinessObject =>
    ({
        id,
        type: ElementTypes.ACTIVITY,
        source,
        target: "w1",
        ...(number === undefined ? {} : { number }),
    }) as unknown as BusinessObject;

describe("useLegacyAnnotationNumberAsHeight", () => {
    it("moves a legacy `number` into `height` and retires the field", () => {
        const element = annotation("t1", { number: 80 });

        useLegacyAnnotationNumberAsHeight([element]);

        expect(element).toEqual({
            id: "t1",
            type: ElementTypes.TEXTANNOTATION,
            height: 80,
        });
    });

    it("prefers an existing `height` but still drops `number`", () => {
        // A file written by a version that had *both* writers: the export pass
        // wrote `height` while the renderer wrote `number`. `height` is the field
        // the export owns, so it wins — and the leftover must not round-trip out
        // again, or the format never actually narrows.
        const element = annotation("t1", { height: 120, number: 80 });

        useLegacyAnnotationNumberAsHeight([element]);

        expect(element.height).toBe(120);
        expect("number" in element).toBe(false);
    });

    it("leaves an unusable `height` of 0 to be replaced", () => {
        // `0` is what `drawAnnotation` guarded against too: a height of zero is
        // no height at all, so the legacy value is still the better one.
        const element = annotation("t1", { height: 0, number: 45 });

        useLegacyAnnotationNumberAsHeight([element]);

        expect(element.height).toBe(45);
    });

    it("ignores a non-numeric `number` rather than writing nonsense height", () => {
        const element = annotation("t1", { number: "80" });

        useLegacyAnnotationNumberAsHeight([element]);

        expect(element.height).toBeUndefined();
        expect("number" in element).toBe(false);
    });

    it("touches nothing that is not an annotation", () => {
        // An *activity's* number is its sequence number and must survive.
        const activityStep = step("a1", "actor1", 3);

        useLegacyAnnotationNumberAsHeight([activityStep]);

        expect((activityStep as unknown as { number: number }).number).toBe(3);
    });
});

describe("numberActivitiesFromActors", () => {
    it("fills the gaps without renumbering the sequence already in the file", () => {
        const elements = [
            shape("actor1"),
            step("a1", "actor1", 1),
            step("a2", "actor1"),
            step("a3", "actor1", 3),
            step("a4", "actor1", null),
        ];

        numberActivitiesFromActors(elements);

        // 1 and 3 are reserved before anything is handed out, so the two
        // unnumbered steps take the lowest free slots — 2, then 4.
        expect(elements.map((element) => (element as any).number)).toEqual([
            undefined,
            1,
            2,
            3,
            4,
        ]);
    });

    it("leaves a work-object-sourced activity unnumbered", () => {
        // Only an activity whose *source* is an actor is a story step; a
        // response arrow keeps whatever it had, including nothing.
        const response = step("a1", "w1");
        const elements = [
            shape("w1", ElementTypes.WORKOBJECT + "Document"),
            response,
        ];

        numberActivitiesFromActors(elements);

        expect("number" in response).toBe(false);
    });

    it("leaves an activity whose source is not in the story unnumbered", () => {
        // Pruning normally removes these first; if one survives, it is not a
        // step and inventing a number for it would inflate the sequence.
        const dangling = step("a1", "gone");

        numberActivitiesFromActors([dangling]);

        expect("number" in dangling).toBe(false);
    });

    it("numbers a story that carries no numbers at all from 1", () => {
        const first = step("a1", "actor1");
        const second = step("a2", "actor1");

        numberActivitiesFromActors([shape("actor1"), first, second]);

        expect([(first as any).number, (second as any).number]).toEqual([1, 2]);
    });
});
