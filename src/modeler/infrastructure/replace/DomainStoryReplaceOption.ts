import { IconDictionaryService } from "../../../iconSet/service";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { Shape } from "diagram-js/lib/model/Types";

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
     * Build the "change to" entries for an actor: every registered actor icon
     * except the one the element already is. `push` (not index assignment)
     * keeps the array dense — the current type is filtered out, so an index-keyed
     * write would leave a hole that renders as an empty menu slot.
     */
    actorReplaceOptions(name: string) {
        const actors = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.ACTOR,
        );

        const replaceOption: ReplaceOption[] = [];

        actors.keysArray().forEach((actorType) => {
            if (!name.includes(actorType)) {
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

    /**
     * The work-object counterpart of {@link actorReplaceOptions}. The
     * `replace-with-workobject-` prefix mirrors the actor branch's shape; the
     * former `replace-with-actor-` was a copy-paste bug (also present upstream —
     * see SYNC.md). `actionName` is only used as a menu-entry record key, so the
     * rename is user-invisible.
     */
    workObjectReplaceOptions(name: string) {
        const workObjects = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.WORKOBJECT,
        );

        const replaceOption: ReplaceOption[] = [];

        workObjects.keysArray().forEach((workObjectType) => {
            if (!name.includes(workObjectType)) {
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
