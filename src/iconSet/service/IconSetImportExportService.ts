import type { IconDictionaryService } from "./IconDictionaryService";
import {
    IconSet,
    IconSetExportConfiguration,
} from "../../story/domain/iconSet";
import { Dictionary } from "../../story/domain/dictionary";
import { ElementTypes } from "../../story/domain/elementTypes";

export type { IconSetExportConfiguration };

/**
 * The inbound raw icon set read from a file, before it is turned into an
 * in-memory {@link IconSet}. `name` is optional because legacy files and the
 * icon-only client API omit it (it then defaults to "").
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

        // fromRecord's null-skip is exactly the old `if (icon)` guard: an actor
        // or work object arriving without an icon is dropped rather than keyed
        // to an empty value.
        return {
            name: fileConfiguration.name ?? "",
            actors: Dictionary.fromRecord(fileConfiguration.actors),
            workObjects: Dictionary.fromRecord(fileConfiguration.workObjects),
        };
    }

    public loadConfiguration(customConfig: IconSet): void {
        // Import replaces the selected icon set with the incoming one. The
        // config always carries real Dictionaries (createIconSetConfiguration
        // builds them), so it is handed downstream verbatim.
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

    private getCurrentConfiguration(): IconSet | undefined {
        const actors = this.iconDictionaryService.getActorsDictionary();
        const workObjects =
            this.iconDictionaryService.getWorkObjectsDictionary();

        let iconSetConfiguration;

        if (actors.length > 0 && workObjects.length > 0) {
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

        // Fill Configuration from Canvas-Objects
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
}
