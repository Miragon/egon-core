import { describe, expect, it } from "vitest";
import { ElementTypes } from "../elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isBackground,
    isConnection,
    isDomainStoryElement,
    isGroup,
    isWorkObject,
} from "../elementPredicates";

/**
 * Pins the classification predicates against every family, their icon-suffixed
 * variants, a foreign namespace, and the null/undefined/typeless edges. These
 * are the single source of type checks now, so their exactness (prefix match,
 * strict boolean, null-safety) is what the grammar and ~15 call sites rely on.
 */

const SUFFIXED_ACTOR = ElementTypes.ACTOR + "Person";
const SUFFIXED_WORKOBJECT = ElementTypes.WORKOBJECT + "Document";

/** A structural type predicate under test, applied to a `{ type }` element. */
type TypePredicate = (element: { type?: string } | null | undefined) => boolean;

const TYPE_PREDICATES: ReadonlyArray<{
    name: string;
    predicate: TypePredicate;
    /** Types the predicate must accept. */
    matches: string[];
}> = [
    {
        name: "isActor",
        predicate: isActor,
        matches: [ElementTypes.ACTOR, SUFFIXED_ACTOR],
    },
    {
        name: "isWorkObject",
        predicate: isWorkObject,
        matches: [ElementTypes.WORKOBJECT, SUFFIXED_WORKOBJECT],
    },
    {
        name: "isActivity",
        predicate: isActivity,
        matches: [ElementTypes.ACTIVITY],
    },
    {
        name: "isConnection",
        predicate: isConnection,
        matches: [ElementTypes.CONNECTION],
    },
    {
        name: "isAnnotation",
        predicate: isAnnotation,
        matches: [ElementTypes.TEXTANNOTATION],
    },
    {
        name: "isGroup",
        predicate: isGroup,
        matches: [ElementTypes.GROUP],
    },
    {
        name: "isDomainStoryElement",
        predicate: isDomainStoryElement,
        matches: [
            ElementTypes.ACTOR,
            SUFFIXED_ACTOR,
            ElementTypes.WORKOBJECT,
            SUFFIXED_WORKOBJECT,
            ElementTypes.ACTIVITY,
            ElementTypes.CONNECTION,
            ElementTypes.TEXTANNOTATION,
            ElementTypes.GROUP,
        ],
    },
];

/** Every concrete type an element can carry in the grammar. */
const ALL_TYPES = [
    ElementTypes.ACTOR,
    SUFFIXED_ACTOR,
    ElementTypes.WORKOBJECT,
    SUFFIXED_WORKOBJECT,
    ElementTypes.ACTIVITY,
    ElementTypes.CONNECTION,
    ElementTypes.TEXTANNOTATION,
    ElementTypes.GROUP,
    "bpmn:task",
];

describe("elementPredicates", () => {
    describe.each(TYPE_PREDICATES)("$name", ({ predicate, matches }) => {
        it.each(ALL_TYPES)("classifies %s", (type) => {
            expect(predicate({ type })).toBe(matches.includes(type));
        });

        it("returns false for a foreign namespace", () => {
            expect(predicate({ type: "bpmn:task" })).toBe(false);
        });

        it("returns strict false for null, undefined, and a typeless element", () => {
            expect(predicate(null)).toBe(false);
            expect(predicate(undefined)).toBe(false);
            expect(predicate({})).toBe(false);
        });
    });

    describe("isBackground", () => {
        it("matches the diagram-js implicit-root id and its variants", () => {
            expect(isBackground({ id: "__implicitroot" })).toBe(true);
            expect(isBackground({ id: "__implicitroot_12ab" })).toBe(true);
        });

        it("rejects any other id, missing id, null, and undefined", () => {
            expect(isBackground({ id: "shape_1" })).toBe(false);
            expect(isBackground({ id: "root" })).toBe(false);
            expect(isBackground({})).toBe(false);
            expect(isBackground(null)).toBe(false);
            expect(isBackground(undefined)).toBe(false);
        });
    });
});
