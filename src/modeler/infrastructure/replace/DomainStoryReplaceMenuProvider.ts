import { Shape } from "diagram-js/lib/model/Types";
import { forEach } from "min-dash";
import { isActor, isWorkObject } from "../../../story/domain/elementPredicates";
import { DomainStoryReplace } from "./DomainStoryReplace";
import {
    DomainStoryReplaceOption,
    ReplaceOption,
} from "./DomainStoryReplaceOption";
import PopupMenuProvider, {
    PopupMenuEntries,
    PopupMenuEntriesProvider,
    PopupMenuEntry,
} from "diagram-js/lib/features/popup-menu/PopupMenuProvider";
import { PopupMenuTarget } from "diagram-js/lib/features/popup-menu/PopupMenu";

export class DomainStoryReplaceMenuProvider implements PopupMenuProvider {
    static $inject: string[] = [
        "domainStoryReplace",
        "domainStoryReplaceOption",
    ];

    constructor(
        private readonly domainStoryReplace: DomainStoryReplace,
        private readonly domainStoryReplaceOption: DomainStoryReplaceOption,
    ) {}

    getPopupMenuEntries(
        target: PopupMenuTarget,
    ): PopupMenuEntriesProvider | PopupMenuEntries {
        return this.getEntries(target);
    }

    private getEntries(element: PopupMenuTarget) {
        const el = element as Shape;

        let entries: ReplaceOption[] = [];
        if (isActor(el)) {
            entries = this.domainStoryReplaceOption.actorReplaceOptions(
                el["type"],
            );
        } else if (isWorkObject(el)) {
            entries = this.domainStoryReplaceOption.workObjectReplaceOptions(
                el["type"],
            );
        }

        return this.createEntries(el, entries);
    }

    private createEntries(element: Shape, replaceOptions: ReplaceOption[]) {
        const menuEntries: Record<string, PopupMenuEntry> = {};

        forEach(replaceOptions, (definition) => {
            menuEntries[definition.actionName] = this.createMenuEntry(
                definition,
                element,
            );
        });

        return menuEntries;
    }

    private createMenuEntry(
        definition: ReplaceOption,
        element: Shape,
        action?: () => void,
    ): PopupMenuEntry {
        const replaceAction = () => {
            return this.domainStoryReplace.replaceElement(
                element,
                definition.target,
            );
        };

        action = action || replaceAction;

        return {
            label: definition.label,
            className: definition.className,
            action: action,
        };
    }
}
