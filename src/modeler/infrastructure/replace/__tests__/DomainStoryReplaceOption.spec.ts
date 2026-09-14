import { describe, expect, it } from "vitest";
import { DomainStoryReplaceOption } from "../DomainStoryReplaceOption";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { Dictionary } from "../../../../story/domain/dictionary";
import { IconDictionaryService } from "../../../../iconSet/service";

/**
 * Locks the two issue-#52 fixes: the options array is dense (built with `push`,
 * so filtering out the current type never leaves a hole that renders as an empty
 * menu slot), and work-object entries use the `replace-with-workobject-` action
 * prefix instead of the copied-over `replace-with-actor-`.
 */

/** Stub icon service backed by a real Dictionary seeded with the given names. */
function iconServiceWith(names: string[]): IconDictionaryService {
    const dictionary = new Dictionary<string>();
    names.forEach((name) => dictionary.set(name, `<svg id="${name}"/>`));

    return {
        getIconsAssignedAs: () => dictionary,
        getCSSClassOfIcon: (name: string) => `icon-domain-story-${name}`,
    } as unknown as IconDictionaryService;
}

describe("DomainStoryReplaceOption", () => {
    describe("actorReplaceOptions", () => {
        const option = new DomainStoryReplaceOption(
            iconServiceWith(["Person", "System", "Group"]),
        );

        it("returns a dense array with the current type filtered out", () => {
            const result = option.actorReplaceOptions(
                ElementTypes.ACTOR + "System",
            );

            // "System" is the middle key: without push() this left a hole at [1]
            expect(result).toHaveLength(2);
            expect(result).not.toContain(undefined);
            expect(result.map((entry) => entry.label)).toEqual([
                "Change to Person",
                "Change to Group",
            ]);
        });

        it("uses the replace-with-actor- prefix and composes target.type", () => {
            const [person] = option.actorReplaceOptions(
                ElementTypes.ACTOR + "System",
            );

            expect(person.actionName).toBe("replace-with-actor-person");
            expect(person.className).toBe("icon-domain-story-Person");
            expect(person.target["type"]).toBe(ElementTypes.ACTOR + "Person");
        });

        it("filters only an exact actor type when names overlap", () => {
            const overlappingOption = new DomainStoryReplaceOption(
                iconServiceWith(["Person", "SalesPerson", "System"]),
            );

            expect(
                overlappingOption
                    .actorReplaceOptions(ElementTypes.ACTOR + "SalesPerson")
                    .map((entry) => entry.label),
            ).toEqual(["Change to Person", "Change to System"]);
        });

        it("does not filter a category-prefix collision", () => {
            expect(
                option
                    .actorReplaceOptions(ElementTypes.WORKOBJECT + "Person")
                    .map((entry) => entry.label),
            ).toEqual([
                "Change to Person",
                "Change to System",
                "Change to Group",
            ]);
        });

        it("keeps every option for an unregistered current type", () => {
            expect(
                option
                    .actorReplaceOptions(ElementTypes.ACTOR + "Customer")
                    .map((entry) => entry.label),
            ).toEqual([
                "Change to Person",
                "Change to System",
                "Change to Group",
            ]);
        });
    });

    describe("workObjectReplaceOptions", () => {
        const option = new DomainStoryReplaceOption(
            iconServiceWith(["Document", "Task", "Folder"]),
        );

        it("returns a dense array with the current type filtered out", () => {
            const result = option.workObjectReplaceOptions(
                ElementTypes.WORKOBJECT + "Task",
            );

            expect(result).toHaveLength(2);
            expect(result).not.toContain(undefined);
            expect(result.map((entry) => entry.label)).toEqual([
                "Change to Document",
                "Change to Folder",
            ]);
        });

        it("uses the replace-with-workobject- prefix and composes target.type", () => {
            const [document] = option.workObjectReplaceOptions(
                ElementTypes.WORKOBJECT + "Task",
            );

            expect(document.actionName).toBe(
                "replace-with-workobject-document",
            );
            expect(document.className).toBe("icon-domain-story-Document");
            expect(document.target["type"]).toBe(
                ElementTypes.WORKOBJECT + "Document",
            );
        });

        it("filters only an exact work-object type when names overlap", () => {
            const overlappingOption = new DomainStoryReplaceOption(
                iconServiceWith(["Document", "SignedDocument", "Folder"]),
            );

            expect(
                overlappingOption
                    .workObjectReplaceOptions(
                        ElementTypes.WORKOBJECT + "SignedDocument",
                    )
                    .map((entry) => entry.label),
            ).toEqual(["Change to Document", "Change to Folder"]);
        });

        it("does not filter a category-prefix collision", () => {
            expect(
                option
                    .workObjectReplaceOptions(ElementTypes.ACTOR + "Document")
                    .map((entry) => entry.label),
            ).toEqual([
                "Change to Document",
                "Change to Task",
                "Change to Folder",
            ]);
        });

        it("keeps every option for an unregistered current type", () => {
            expect(
                option
                    .workObjectReplaceOptions(
                        ElementTypes.WORKOBJECT + "Message",
                    )
                    .map((entry) => entry.label),
            ).toEqual([
                "Change to Document",
                "Change to Task",
                "Change to Folder",
            ]);
        });
    });
});
