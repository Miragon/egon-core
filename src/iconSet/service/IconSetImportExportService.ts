import type { IconDictionaryService } from "./IconDictionaryService";
import {
    IconSet,
    IconSetExportConfiguration,
} from "../../domain/entities/iconSet";
import { Dictionary } from "../../domain/entities/dictionary";
import { ElementTypes } from "../../domain/entities/elementTypes";

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
                actors: new Dictionary(),
                workObjects: new Dictionary(),
            };
        }

        const actorsDict = new Dictionary();
        const workObjectsDict = new Dictionary();
        Object.keys(fileConfiguration.actors).forEach((key) => {
            const icon = fileConfiguration.actors[key];
            if (icon) {
                // make sure the actor has an icon
                actorsDict.add(icon, key);
            }
        });

        Object.keys(fileConfiguration.workObjects).forEach((key) => {
            const icon = fileConfiguration.workObjects[key];
            if (icon) {
                // make sure the work object has an icon
                workObjectsDict.add(icon, key);
            }
        });

        return {
            name: fileConfiguration.name ?? "",
            actors: actorsDict,
            workObjects: workObjectsDict,
        };
    }

    public loadConfiguration(customConfig: IconSet): void {
        let actorDict = new Dictionary();
        let workObjectDict = new Dictionary();

        // Normalize: a config may arrive as real Dictionaries or as plain
        // name→SVG objects; either way build Dictionaries to hand downstream.
        if (customConfig.actors.keysArray()) {
            actorDict = customConfig.actors;
            workObjectDict = customConfig.workObjects;
        } else {
            actorDict.addEach(customConfig.actors);
            workObjectDict.addEach(customConfig.workObjects);
        }

        // Import replaces the selected icon set with the incoming one.
        this.iconDictionaryService.updateIconRegistries({
            name: customConfig.name,
            actors: actorDict,
            workObjects: workObjectDict,
        });
    }

    getCurrentConfigurationForExport(): IconSetExportConfiguration | undefined {
        const currentConfiguration = this.getCurrentConfiguration();

        if (currentConfiguration) {
            const actors: any = {};
            const workObjects: any = {};

            currentConfiguration.actors.all().forEach((entry) => {
                actors[entry.key] = entry.value;
            });
            currentConfiguration.workObjects.all().forEach((entry) => {
                workObjects[entry.key] = entry.value;
            });

            return {
                name: currentConfiguration.name,
                actors: actors,
                workObjects: workObjects,
            };
        }
        return;
    }

    private getCurrentConfiguration(): IconSet | undefined {
        const actors = this.iconDictionaryService.getActorsDictionary();
        const workObjects =
            this.iconDictionaryService.getWorkObjectsDictionary();

        let iconSetConfiguration;

        if (actors.size() > 0 && workObjects.size() > 0) {
            iconSetConfiguration = this.createConfigFromDictionaries(
                actors,
                workObjects,
            );
        }
        return iconSetConfiguration;
    }

    private createConfigFromDictionaries(
        actorsDict: Dictionary,
        workObjectsDict: Dictionary,
    ): IconSet {
        const actorNames = actorsDict.keysArray();
        const workobjectNames = workObjectsDict.keysArray();
        const newActors = new Dictionary();
        const newWorkobjects = new Dictionary();

        // Fill Configuration from Canvas-Objects
        actorNames.forEach((actor) => {
            newActors.add(
                actorsDict.get(actor),
                actor.replace(ElementTypes.ACTOR, ""),
            );
        });
        workobjectNames.forEach((workObject) => {
            newWorkobjects.add(
                workObjectsDict.get(workObject),
                workObject.replace(ElementTypes.WORKOBJECT, ""),
            );
        });

        return {
            name: this.iconDictionaryService.getIconSetName(),
            actors: newActors,
            workObjects: newWorkobjects,
        };
    }
}
