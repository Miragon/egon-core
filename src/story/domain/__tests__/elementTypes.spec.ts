import { describe, expect, it } from "vitest";
import { ElementTypes, getIconId } from "../elementTypes";

/**
 * `getIconId` is the inverse of the type-naming convention: actor and
 * work-object types carry the icon name as a suffix
 * (`domainStory:actorPerson`), and everything that needs to *resolve* an icon —
 * the renderer, the label dictionary, the used-icon list — goes through here.
 * Get it wrong and elements render blank, because `IconDictionaryService`
 * answers `""` for an unknown name rather than throwing.
 *
 * The empty-string case matters as much as the two hits: it is what tells the
 * caller "this element has no icon", and the types that reach it (activity,
 * connection, group, annotation) are exactly the ones drawn without one.
 */
describe("getIconId", () => {
    it("strips the actor prefix", () => {
        expect(getIconId(ElementTypes.ACTOR + "Person")).toBe("Person");
    });

    it("strips the work object prefix", () => {
        expect(getIconId(ElementTypes.WORKOBJECT + "Document")).toBe(
            "Document",
        );
    });

    it("answers empty for a type that carries no icon", () => {
        for (const type of [
            ElementTypes.ACTIVITY,
            ElementTypes.CONNECTION,
            ElementTypes.GROUP,
            ElementTypes.TEXTANNOTATION,
        ]) {
            expect(getIconId(type)).toBe("");
        }
    });

    it("answers empty for a bare prefix and for an unrelated string", () => {
        expect(getIconId(ElementTypes.ACTOR)).toBe("");
        expect(getIconId("something:else")).toBe("");
    });

    it("keeps an icon name that itself contains the prefix text", () => {
        // Only the leading prefix is removed; `replace` without a global flag
        // stops after the first match, which is what makes this safe.
        expect(getIconId(ElementTypes.ACTOR + "actorLike")).toBe("actorLike");
    });
});
