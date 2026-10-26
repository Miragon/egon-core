import { Dictionary } from "../../story/domain/dictionary";
import { IconSet } from "../../story/domain/iconSet";
import { ElementTypes } from "../../story/domain/elementTypes";
import { sanitizeForCss } from "../../shared/domain/sanitizer";
import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";
import { IconSanitizerPort } from "../domain/ports/IconSanitizerPort";
import type { IconCategory } from "../domain/IconTypes";

export const ICON_CSS_CLASS_PREFIX = "icon-domain-story-";

export class IconDictionaryService {
    static $inject: string[] = [
        "domainStoryIconStyleSheet",
        "domainStoryIconSanitizer",
    ];

    private selectedActorsDictionary = new Dictionary<string>();
    private selectedWorkObjectsDictionary = new Dictionary<string>();

    // Instance-owned so two EgonClient instances on one page never share icons
    // (ADR ARC-5).
    private readonly customIcons = new Dictionary<string>();

    // Kept here so export can round-trip it; the element registry holds no
    // icon-set metadata.
    private iconSetName = "";

    // Required: a defaulted port would let DOM coupling back into this service.
    constructor(
        private readonly iconStyleSheet: IconStyleSheetPort,
        private readonly iconSanitizer: IconSanitizerPort,
    ) {}

    registerIconForType(type: ElementTypes, name: string, src: string): void {
        if (name.includes(type)) {
            throw new Error("Name should not include type!");
        }

        this.getSelectedDictionary(type).set(
            name,
            this.iconSanitizer.sanitize(src),
        );
    }

    /**
     * Artwork is shared by name: the other category's entry of the same name is
     * refreshed too, but never added. Sanitizing finishes before the first
     * mutation, so a rejected update changes nothing.
     */
    upsertIconForType(type: ElementTypes, name: string, src: string): string {
        const selected = this.getSelectedDictionary(type);
        if (name.includes(type)) {
            throw new Error("Name should not include type!");
        }
        const sanitized = this.iconSanitizer.sanitize(src);
        const otherSelected =
            type === ElementTypes.ACTOR
                ? this.selectedWorkObjectsDictionary
                : this.selectedActorsDictionary;

        this.replaceEntry(this.customIcons, name, sanitized);
        this.replaceEntry(selected, name, sanitized);
        if (otherSelected.has(name)) {
            this.replaceEntry(otherSelected, name, sanitized);
        }

        return sanitized;
    }

    unregisterIconForType(type: ElementTypes, name: string): void {
        if (name.includes(type)) {
            throw new Error("Name should not include type!");
        }

        this.getSelectedDictionary(type).delete(name);
    }

    updateIconRegistries(config: IconSet): void {
        const sanitizedConfig = this.sanitizeIconSet(config);
        const currentIcons = new Dictionary<string>();
        // Dictionary is first-write-wins, so actors deliberately take
        // precedence when one imported set uses the same name in both halves.
        currentIcons.appendDict(sanitizedConfig.actors);
        currentIcons.appendDict(sanitizedConfig.workObjects);

        // Replace incoming values explicitly (Dictionary.set() never
        // overwrites) and keep pool entries this import lacks.
        currentIcons.keysArray().forEach((key) => {
            this.customIcons.delete(key);
            this.customIcons.set(key, currentIcons.get(key));
        });

        this.addIconsToCss(currentIcons);

        // Import replaces the selection rather than merging (ADR ICO-3).
        this.setIconSet(sanitizedConfig);
    }

    addIMGToIconDictionary(input: string, name: string): string {
        const sanitized = this.iconSanitizer.sanitize(input);
        this.customIcons.set(name, sanitized);
        return this.customIcons.get(name);
    }

    addIconsToCss(icons: Dictionary<string>) {
        icons.keysArray().forEach((key) => {
            this.iconStyleSheet.addIconStyle(
                this.getCSSClassOfIcon(key),
                this.iconSanitizer.sanitize(icons.get(key)),
            );
        });
    }

    getFullDictionary(): Dictionary<string> {
        const fullDictionary = new Dictionary<string>();
        fullDictionary.appendDict(this.customIcons);
        return fullDictionary;
    }

    /** Seed a new editor session with an isolated copy of the sanitized pool. */
    restoreCustomIcons(icons: Dictionary<string>): void {
        const restored = this.sanitizeDictionary(icons);
        restored.keysArray().forEach((name) => {
            this.customIcons.delete(name);
            this.customIcons.set(name, restored.get(name));
        });
        this.addIconsToCss(restored);
    }

    getIconsAssignedAs(type: ElementTypes): Dictionary<string> {
        if (type === ElementTypes.ACTOR) {
            return this.selectedActorsDictionary;
        } else if (type === ElementTypes.WORKOBJECT) {
            return this.selectedWorkObjectsDictionary;
        }
        return new Dictionary<string>();
    }

    getCSSClassOfIcon(name: string): string {
        return ICON_CSS_CLASS_PREFIX + sanitizeForCss(name);
    }

    /**
     * The pool first, then the selected dictionaries for registrations that
     * bypass it. Returns "" on a miss, so an element whose icon is absent
     * renders empty instead of crashing the render pass.
     */
    getIconSource(name: string): string {
        return (
            this.customIcons.find(name) ??
            this.selectedActorsDictionary.find(name) ??
            this.selectedWorkObjectsDictionary.find(name) ??
            ""
        );
    }

    getActorsDictionary(): Dictionary<string> {
        return this.selectedActorsDictionary;
    }

    getWorkObjectsDictionary(): Dictionary<string> {
        return this.selectedWorkObjectsDictionary;
    }

    getIconSetName(): string {
        return this.iconSetName;
    }

    /** Reorders a selected category after validating an exact permutation. */
    setIconOrder(category: IconCategory, names: readonly string[]): boolean {
        const type =
            category === "actor"
                ? ElementTypes.ACTOR
                : category === "workObject"
                  ? ElementTypes.WORKOBJECT
                  : undefined;
        if (!type) {
            throw new TypeError(`Unknown icon category: ${String(category)}`);
        }

        const current = this.getSelectedDictionary(type);
        const currentNames = current.keysArray();
        if (new Set(names).size !== names.length) {
            throw new Error(`Icon order for ${category} contains duplicates`);
        }
        if (
            names.length !== currentNames.length ||
            names.some((name) => !current.has(name))
        ) {
            throw new Error(
                `Icon order for ${category} must be an exact permutation of the selected names`,
            );
        }
        if (names.every((name, index) => name === currentNames[index])) {
            return false;
        }

        const reordered = new Dictionary<string>();
        names.forEach((name) => reordered.set(name, current.get(name)));
        if (type === ElementTypes.ACTOR) {
            this.selectedActorsDictionary = reordered;
        } else {
            this.selectedWorkObjectsDictionary = reordered;
        }
        return true;
    }

    setIconSet(iconSet: IconSet): void {
        const sanitized = this.sanitizeIconSet(iconSet);
        this.iconSetName = sanitized.name;
        this.selectedActorsDictionary = sanitized.actors;
        this.selectedWorkObjectsDictionary = sanitized.workObjects;
    }

    private sanitizeIconSet(iconSet: IconSet): IconSet {
        return {
            name: iconSet.name ?? "",
            actors: this.sanitizeDictionary(iconSet.actors),
            workObjects: this.sanitizeDictionary(iconSet.workObjects),
        };
    }

    private sanitizeDictionary(source: Dictionary<string>): Dictionary<string> {
        const sanitized = new Dictionary<string>();
        source.keysArray().forEach((name) => {
            sanitized.set(name, this.iconSanitizer.sanitize(source.get(name)));
        });
        return sanitized;
    }

    private replaceEntry(
        dictionary: Dictionary<string>,
        name: string,
        source: string,
    ): void {
        dictionary.delete(name);
        dictionary.set(name, source);
    }

    private getSelectedDictionary(type: ElementTypes): Dictionary<string> {
        if (type === ElementTypes.ACTOR) {
            return this.selectedActorsDictionary;
        }
        if (type === ElementTypes.WORKOBJECT) {
            return this.selectedWorkObjectsDictionary;
        }
        throw new Error(`Unsupported icon element type: ${type}`);
    }
}
