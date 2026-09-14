import type CommandStack from "diagram-js/lib/command/CommandStack";

import type {
    LabelDictionary,
    LabelRenameBatch,
    ResolvedLabelRename,
} from "../domain/LabelDictionary";
import { IconDictionaryService } from "../../iconSet/service";
import { getIconId } from "../../story/domain/elementTypes";
import { isActivity, isWorkObject } from "../../story/domain/elementPredicates";
import { ElementRegistryService } from "../../modeler/service";

export class LabelDictionaryService {
    static $inject: string[] = [
        "domainStoryElementRegistryService",
        "domainStoryIconDictionaryService",
        "commandStack",
    ];

    constructor(
        private readonly elementRegistryService: ElementRegistryService,
        private readonly iconDictionaryService: IconDictionaryService,
        private readonly commandStack: CommandStack,
    ) {}

    getDictionary(): LabelDictionary {
        const activities = new Map<
            string,
            { name: string; originalName: string }
        >();
        const workObjects = new Map<
            string,
            { name: string; originalName: string; icon?: string }
        >();

        this.elementRegistryService.getAllCanvasObjects().forEach((element) => {
            const name = element.businessObject.name;
            if (
                name &&
                name.length > 0 &&
                isActivity(element) &&
                !activities.has(name)
            ) {
                activities.set(name, { name, originalName: name });
            } else if (
                name &&
                name.length > 0 &&
                isWorkObject(element) &&
                !workObjects.has(name)
            ) {
                const iconName = getIconId(element.type);
                let icon = this.iconDictionaryService.getIconSource(iconName);
                if (icon && !icon.startsWith("data")) {
                    icon = "data:image/svg+xml," + icon;
                }
                workObjects.set(name, {
                    name,
                    originalName: name,
                    ...(icon ? { icon } : {}),
                });
            }
        });

        return {
            activities: [...activities.values()].sort(compareLabels),
            workObjects: [...workObjects.values()].sort(compareLabels),
        };
    }

    renameLabels(changes: LabelRenameBatch): readonly string[] {
        const replacements = validatedReplacements(changes);
        const updates: ResolvedLabelRename[] = [];

        for (const element of this.elementRegistryService.getAllCanvasObjects()) {
            const category = isActivity(element)
                ? "activity"
                : isWorkObject(element)
                  ? "workObject"
                  : undefined;
            if (!category) continue;

            const originalName = element.businessObject.name;
            const replacement = replacements.get(
                `${category}\u0000${originalName}`,
            );
            if (replacement !== undefined && replacement !== originalName) {
                updates.push({ element, name: replacement });
            }
        }

        if (updates.length > 0) {
            this.commandStack.execute("labels.renameBatch", { updates });
        }

        return updates.map(({ element }) => element.id);
    }

    getUniqueWorkObjectNames(): string[] {
        const workObjects = this.elementRegistryService.getAllWorkObjects();
        return [
            ...new Set(
                workObjects
                    .filter((workObject) => {
                        return !!workObject.businessObject.name;
                    })
                    .map((workObject) => workObject.businessObject.name),
            ),
        ];
    }
}

function compareLabels(
    left: { name: string },
    right: { name: string },
): number {
    return (
        left.name
            .toLocaleLowerCase()
            .localeCompare(right.name.toLocaleLowerCase()) ||
        left.name.localeCompare(right.name)
    );
}

function validatedReplacements(changes: LabelRenameBatch): Map<string, string> {
    const replacements = new Map<string, string>();
    for (const change of changes) {
        if (
            change?.category !== "activity" &&
            change?.category !== "workObject"
        ) {
            throw new TypeError(
                `Unknown label category: ${String(change?.category)}`,
            );
        }
        const key = `${change.category}\u0000${change.originalName}`;
        const existing = replacements.get(key);
        if (existing !== undefined && existing !== change.name) {
            throw new Error(
                `Conflicting replacements for ${change.category} label ${change.originalName}`,
            );
        }
        replacements.set(key, change.name);
    }
    return replacements;
}
