import { IconDictionaryService } from "../../../iconSet/service";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { Shape } from "diagram-js/lib/model/Types";
import { isReplacementEligible } from "../../../story/domain/replacementPolicy";

export type ReplaceOption = {
    label: string;
    actionName: string;
    className: string;
    target: Partial<Shape>;
};

export class DomainStoryReplaceOption {
    static $inject: string[] = ["domainStoryIconDictionaryService"];

    constructor(
        private readonly iconDictionaryService: IconDictionaryService,
    ) {}

    /**
     * `push`, not index assignment: the current type is skipped, and a hole would
     * render as an empty menu slot.
     */
    actorReplaceOptions(name: string) {
        const actors = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.ACTOR,
        );

        const replaceOption: ReplaceOption[] = [];

        actors.keysArray().forEach((actorType) => {
            if (isReplacementEligible(name, ElementTypes.ACTOR, actorType)) {
                replaceOption.push({
                    label: "Change to " + actorType,
                    actionName: "replace-with-actor-" + actorType.toLowerCase(),
                    className:
                        this.iconDictionaryService.getCSSClassOfIcon(actorType),
                    target: {
                        type: `${ElementTypes.ACTOR}${actorType}`,
                    },
                });
            }
        });
        return replaceOption;
    }

    /** Upstream copy-pastes the `replace-with-actor-` prefix here (SYNC.md). */
    workObjectReplaceOptions(name: string) {
        const workObjects = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.WORKOBJECT,
        );

        const replaceOption: ReplaceOption[] = [];

        workObjects.keysArray().forEach((workObjectType) => {
            if (
                isReplacementEligible(
                    name,
                    ElementTypes.WORKOBJECT,
                    workObjectType,
                )
            ) {
                replaceOption.push({
                    label: "Change to " + workObjectType,
                    actionName:
                        "replace-with-workobject-" +
                        workObjectType.toLowerCase(),
                    className:
                        this.iconDictionaryService.getCSSClassOfIcon(
                            workObjectType,
                        ),
                    target: {
                        type: `${ElementTypes.WORKOBJECT}${workObjectType}`,
                    },
                });
            }
        });
        return replaceOption;
    }
}
