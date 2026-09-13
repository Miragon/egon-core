import { describe, expect, it } from "vitest";

import { ElementTypes } from "../elementTypes";
import {
    canAutocompleteLabel,
    canEditLabel,
    semanticLabelField,
} from "../labelPolicy";

describe("semanticLabelField", () => {
    it.each([
        ElementTypes.ACTOR,
        ElementTypes.ACTOR + "Person",
        ElementTypes.WORKOBJECT,
        ElementTypes.WORKOBJECT + "Document",
        ElementTypes.ACTIVITY,
        ElementTypes.GROUP,
    ])("uses name for %s", (type) => {
        expect(semanticLabelField({ type })).toBe("name");
    });

    it("uses text for annotations", () => {
        expect(semanticLabelField({ type: ElementTypes.TEXTANNOTATION })).toBe(
            "text",
        );
    });

    it.each([
        ElementTypes.CONNECTION,
        "domainStory:unsupported",
        "bpmn:task",
        undefined,
    ])("returns undefined for unsupported or missing type %s", (type) => {
        expect(semanticLabelField({ type })).toBeUndefined();
    });

    it.each([null, undefined])("returns undefined for %s", (semantic) => {
        expect(semanticLabelField(semantic)).toBeUndefined();
    });
});

describe("canEditLabel", () => {
    it("rejects the canvas background independently of semantic type", () => {
        expect(
            canEditLabel(
                { id: "__implicitroot_1" },
                { type: ElementTypes.ACTOR + "Person" },
            ),
        ).toBe(false);
    });

    it("accepts supported semantics on ordinary canvas elements", () => {
        expect(
            canEditLabel(
                { id: "Actor_1" },
                { type: ElementTypes.ACTOR + "Person" },
            ),
        ).toBe(true);
    });

    it.each([ElementTypes.CONNECTION, "domainStory:unsupported", undefined])(
        "rejects unsupported or missing semantic type %s",
        (type) => {
            expect(canEditLabel({ id: "Element_1" }, { type })).toBe(false);
        },
    );
});

describe("canAutocompleteLabel", () => {
    it("accepts work-object types, including icon suffixes", () => {
        expect(
            canAutocompleteLabel({
                type: ElementTypes.WORKOBJECT + "Document",
            }),
        ).toBe(true);
    });

    it.each([
        ElementTypes.ACTOR + "Person",
        ElementTypes.ACTIVITY,
        ElementTypes.GROUP,
        ElementTypes.TEXTANNOTATION,
        ElementTypes.CONNECTION,
        undefined,
    ])("rejects non-work-object or missing type %s", (type) => {
        expect(canAutocompleteLabel({ type })).toBe(false);
    });

    it.each([null, undefined])("rejects %s", (semantic) => {
        expect(canAutocompleteLabel(semantic)).toBe(false);
    });
});
