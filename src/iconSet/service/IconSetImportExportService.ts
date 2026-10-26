import type { IconDictionaryService } from "./IconDictionaryService";
import {
    IconSet,
    IconSetExportConfiguration,
} from "../../story/domain/iconSet";
import { Dictionary } from "../../story/domain/dictionary";
import { ElementTypes } from "../../story/domain/elementTypes";
import { UsedIconList } from "../../story/domain/UsedIconList";

export type { IconSetExportConfiguration };

/**
 * The raw icon set read from a file. `name` is optional because legacy files
 * and the icon-only client API omit it.
 */
export interface FileConfiguration {
    name?: string;
    actors: { [p: string]: any };
    workObjects: { [p: string]: any };
}

export class IconSetImportExportService {
    static $inject: string[] = ["domainStoryIconDictionaryService"];

    constructor(
        private readonly iconDictionaryService: IconDictionaryService,
    ) {}

    public createIconSetConfiguration(
        fileConfiguration: FileConfiguration | undefined,
    ): IconSet {
        if (fileConfiguration === undefined) {
            return {
                name: "",
                actors: new Dictionary<string>(),
                workObjects: new Dictionary<string>(),
            };
        }

        return {
            name: fileConfiguration.name ?? "",
            actors: Dictionary.fromRecord(fileConfiguration.actors),
            workObjects: Dictionary.fromRecord(fileConfiguration.workObjects),
        };
    }

    public loadConfiguration(customConfig: IconSet): void {
        this.iconDictionaryService.updateIconRegistries(customConfig);
    }

    getCurrentConfigurationForExport(): IconSetExportConfiguration | undefined {
        const currentConfiguration = this.getCurrentConfiguration();

        if (currentConfiguration) {
            return {
                name: currentConfiguration.name,
                actors: currentConfiguration.actors.toRecord(),
                workObjects: currentConfiguration.workObjects.toRecord(),
            };
        }
        return;
    }

    /**
     * A diagram may still use an icon that was removed from the selection or
     * displaced by `loadIcons()`; such icons are exported from the pool,
     * without changing pool or selection as a side effect.
     */
    getConfigurationForStoryExport(
        usedIcons: UsedIconList,
    ): IconSetExportConfiguration | undefined {
        const actors = this.iconDictionaryService
            .getActorsDictionary()
            .toRecord();
        const workObjects = this.iconDictionaryService
            .getWorkObjectsDictionary()
            .toRecord();

        this.addReferencedIcons(actors, usedIcons.actors);
        this.addReferencedIcons(workObjects, usedIcons.workObjects);

        if (
            Object.keys(actors).length === 0 &&
            Object.keys(workObjects).length === 0
        ) {
            return;
        }

        return {
            name: this.iconDictionaryService.getIconSetName(),
            actors,
            workObjects,
        };
    }

    private getCurrentConfiguration(): IconSet | undefined {
        const actors = this.iconDictionaryService.getActorsDictionary();
        const workObjects =
            this.iconDictionaryService.getWorkObjectsDictionary();

        let iconSetConfiguration;

        // `||`, unlike upstream's `&&`: upstream always has the default set
        // loaded, but here a set with only actors or only work objects is
        // legal.
        if (actors.length > 0 || workObjects.length > 0) {
            iconSetConfiguration = this.createConfigFromDictionaries(
                actors,
                workObjects,
            );
        }
        return iconSetConfiguration;
    }

    private createConfigFromDictionaries(
        actorsDict: Dictionary<string>,
        workObjectsDict: Dictionary<string>,
    ): IconSet {
        const actorNames = actorsDict.keysArray();
        const workobjectNames = workObjectsDict.keysArray();
        const newActors = new Dictionary<string>();
        const newWorkobjects = new Dictionary<string>();

        actorNames.forEach((actor) => {
            newActors.set(
                actor.replace(ElementTypes.ACTOR, ""),
                actorsDict.get(actor),
            );
        });
        workobjectNames.forEach((workObject) => {
            newWorkobjects.set(
                workObject.replace(ElementTypes.WORKOBJECT, ""),
                workObjectsDict.get(workObject),
            );
        });

        return {
            name: this.iconDictionaryService.getIconSetName(),
            actors: newActors,
            workObjects: newWorkobjects,
        };
    }

    private addReferencedIcons(
        selectedIcons: Record<string, string>,
        usedIconNames: string[],
    ): void {
        for (const name of new Set(usedIconNames)) {
            if (name in selectedIcons) {
                continue;
            }

            const source = this.iconDictionaryService.getIconSource(name);
            if (source) {
                selectedIcons[name] = source;
            }
        }
    }
}
