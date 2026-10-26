import { describe, expect, it } from "vitest";
import { ElementTypes, getIconId } from "../elementTypes";

/**
 * A wrong answer renders elements blank, because `IconDictionaryService`
 * answers `""` for an unknown name instead of throwing. `""` itself means "no
 * icon".
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
        // `replace` without a global flag stops after the leading prefix.
        expect(getIconId(ElementTypes.ACTOR + "actorLike")).toBe("actorLike");
    });
});
