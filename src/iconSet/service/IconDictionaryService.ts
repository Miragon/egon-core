import { Dictionary } from "../../story/domain/dictionary";
import { IconSet } from "../../story/domain/iconSet";
import { ElementTypes } from "../../story/domain/elementTypes";
import { sanitizeForCss } from "../../shared/domain/sanitizer";
import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";

export const ICON_CSS_CLASS_PREFIX = "icon-domain-story-";

const customIcons = new Dictionary();

/**
 * The dictionaries hold icons (as SVG) and icon names as key-value pairs:
 */
export class IconDictionaryService {
    static $inject: string[] = ["domainStoryIconStyleSheet"];

    // these dictionaries make up the current icon set:
    private selectedActorsDictionary = new Dictionary();
    private selectedWorkObjectsDictionary = new Dictionary();

    // the imported icon set's name, kept here (next to the dictionaries it
    // belongs to) so export can round-trip it — the element registry holds no
    // icon-set metadata. Defaults to "" until an icon set is loaded.
    private iconSetName = "";

    // Required (no default): a defaulted port would let a caller silently smuggle
    // DOM coupling back into this service. The stylesheet is injected from
    // outside so the service stays free of DOM/CSSOM detail.
    constructor(private readonly iconStyleSheet: IconStyleSheetPort) {}

    registerIconForType(type: ElementTypes, name: string, src: string): void {
        if (name.includes(type)) {
            throw new Error("Name should not include type!");
        }

        let collection = new Dictionary();
        if (type === ElementTypes.ACTOR) {
            collection = this.selectedActorsDictionary;
        } else if (type === ElementTypes.WORKOBJECT) {
            collection = this.selectedWorkObjectsDictionary;
        }
        collection.add(src, name);
    }

    unregisterIconForType(type: ElementTypes, name: string): void {
        if (name.includes(type)) {
            throw new Error("Name should not include type!");
        }

        let collection = new Dictionary();
        if (type === ElementTypes.ACTOR) {
            collection = this.selectedActorsDictionary;
        } else if (type === ElementTypes.WORKOBJECT) {
            collection = this.selectedWorkObjectsDictionary;
        }
        collection.delete(name);
    }

    updateIconRegistries(config: IconSet): void {
        const newIcons = new Dictionary();
        this.extractCustomIconsFromDictionary(config.actors, newIcons);
        this.extractCustomIconsFromDictionary(config.workObjects, newIcons);

        // Add new icons to the global dictionary
        newIcons.keysArray().forEach((key) => {
            const custom = newIcons.get(key);
            this.addIMGToIconDictionary(custom, key);
        });

        // Generate CSS for ALL custom icons in the current story's config
        const allCurrentIcons = new Dictionary();
        allCurrentIcons.appendDict(config.actors);
        allCurrentIcons.appendDict(config.workObjects);
        this.addIconsToCss(allCurrentIcons);

        // Import replaces (rather than merges into) the selected icon set:
        // hard-swap the selected dictionaries + name to the imported config.
        this.setIconSet(config);
    }

    addIMGToIconDictionary(input: string, name: string): void {
        customIcons.set(name, input);
    }

    addIconsToCss(customIcons: Dictionary) {
        // The service owns *which* class an icon maps to (getCSSClassOfIcon —
        // the issue-#4 regression pins class == published rule); the injected
        // port owns *how* that class becomes a live stylesheet rule.
        customIcons.keysArray().forEach((key) => {
            this.iconStyleSheet.addIconStyle(
                this.getCSSClassOfIcon(key),
                customIcons.get(key),
            );
        });
    }

    /** Getter & Setter **/

    getFullDictionary(): Dictionary {
        const fullDictionary = new Dictionary();
        fullDictionary.appendDict(customIcons);
        return fullDictionary;
    }

    getIconsAssignedAs(type: ElementTypes): Dictionary {
        if (type === ElementTypes.ACTOR) {
            return this.selectedActorsDictionary;
        } else if (type === ElementTypes.WORKOBJECT) {
            return this.selectedWorkObjectsDictionary;
        }
        return new Dictionary();
    }

    getTypeIconSRC(type: ElementTypes, name: string): string {
        if (type === ElementTypes.ACTOR) {
            return this.selectedActorsDictionary.get(name);
        } else if (type === ElementTypes.WORKOBJECT) {
            return this.selectedWorkObjectsDictionary.get(name);
        }
        throw new Error(
            `[IconDictionaryService] Unsupported value type: ${type}`,
        );
    }

    getCSSClassOfIcon(name: string): string {
        return ICON_CSS_CLASS_PREFIX + sanitizeForCss(name);
    }

    getIconSource(name: string): string {
        if (customIcons.has(name)) {
            return customIcons.get(name);
        }
        throw new Error(
            `[IconDictionaryService] Unsupported value name: ${name}`,
        );
    }

    getActorsDictionary(): Dictionary {
        return this.selectedActorsDictionary;
    }

    getWorkObjectsDictionary(): Dictionary {
        return this.selectedWorkObjectsDictionary;
    }

    getIconSetName(): string {
        return this.iconSetName;
    }

    setIconSet(iconSet: IconSet): void {
        this.iconSetName = iconSet.name ?? "";
        this.selectedActorsDictionary = iconSet.actors;
        this.selectedWorkObjectsDictionary = iconSet.workObjects;
    }

    private extractCustomIconsFromDictionary(
        elementDictionary: Dictionary,
        customIcons: Dictionary,
    ) {
        // Keys are stored verbatim: sanitizing here permanently mutated names
        // (e.g. "my.icon.v2" → "my.icon"), losing the original on round-trip.
        elementDictionary.keysArray().forEach((name) => {
            if (!this.getFullDictionary().has(name)) {
                customIcons.add(elementDictionary.get(name), name);
            }
        });
    }
}
