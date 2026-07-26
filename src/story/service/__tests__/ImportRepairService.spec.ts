import { describe, expect, it } from "vitest";
import { ImportRepairService } from "../ImportRepairService";
import { ElementTypes } from "../../domain/elementTypes";
import { BusinessObject } from "../../domain/businessObject";

/**
 * The facade owns no logic — the rules and their branch matrix are pinned in
 * `src/story/domain/__tests__/importRepair.spec.ts`. This spec only proves each
 * of the four upstream-named methods routes to the rule it claims to, so a
 * mis-wired delegation cannot slip through unnoticed.
 */
describe("ImportRepairService delegation", () => {
    const element = (overrides: Partial<BusinessObject> & { id: string }) =>
        overrides as unknown as BusinessObject;

    it("checkForUnreferencedElementsInActivitiesAndRepair prunes dangling edges", () => {
        const dangling = element({
            id: "e1",
            type: ElementTypes.ACTIVITY,
            source: "a",
            target: "gone",
        } as never);
        const actor = element({ id: "a", type: ElementTypes.ACTOR + "Person" });

        const result =
            new ImportRepairService().checkForUnreferencedElementsInActivitiesAndRepair(
                [actor, dangling],
            );

        expect(result.elements).toEqual([actor]);
        expect(result.removedConnections).toEqual([dangling]);
    });

    it("updateCustomElementsPreviousV050 renames the legacy work-object types", () => {
        const elements = [
            element({ id: "a", type: ElementTypes.WORKOBJECT }),
            element({ id: "b", type: ElementTypes.WORKOBJECT + "Bubble" }),
        ];

        new ImportRepairService().updateCustomElementsPreviousV050(elements);

        expect(elements.map((bo) => bo.type)).toEqual([
            `${ElementTypes.WORKOBJECT}Document`,
            `${ElementTypes.WORKOBJECT}Conversation`,
        ]);
    });

    it("removeWhitespacesFromIcons hyphenates icon names", () => {
        const elements = [
            element({ id: "a", type: `${ElementTypes.ACTOR}My Icon` }),
        ];

        new ImportRepairService().removeWhitespacesFromIcons(elements);

        expect(elements[0].type).toBe(`${ElementTypes.ACTOR}My-Icon`);
    });

    it("removeUnnecessaryBpmnProperties deletes the moddle leftovers", () => {
        const elements = [
            element({
                id: "a",
                type: ElementTypes.ACTOR,
                $type: "domainStory:actor",
                $descriptor: {},
                di: {},
            } as never),
        ];

        new ImportRepairService().removeUnnecessaryBpmnProperties(elements);

        expect(elements[0]).toEqual({ id: "a", type: ElementTypes.ACTOR });
    });
});
