import { Dictionary } from "../../story/domain/dictionary";
import { IconSet } from "../../story/domain/iconSet";
import { ElementTypes } from "../../story/domain/elementTypes";
import { sanitizeForCss } from "../../shared/domain/sanitizer";
import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";
import { IconSanitizerPort } from "../domain/ports/IconSanitizerPort";
import type { IconCategory } from "../domain/IconTypes";

export const ICON_CSS_CLASS_PREFIX = "icon-domain-story-";

/**
 * The dictionaries hold icons (as SVG) and icon names as key-value pairs:
 */
export class IconDictionaryService {
    static $inject: string[] = [
        "domainStoryIconStyleSheet",
        "domainStoryIconSanitizer",
    ];

    // these dictionaries make up the current icon set:
    private selectedActorsDictionary = new Dictionary<string>();
    private selectedWorkObjectsDictionary = new Dictionary<string>();

    // The pool of all known custom icons. Instance-owned (not module scope) so
    // two EgonClient instances on one page don't share one icon pool — a shared
    // pool cross-contaminated their icon sets (issue #12).
    private readonly customIcons = new Dictionary<string>();

    // the imported icon set's name, kept here (next to the dictionaries it
    // belongs to) so export can round-trip it — the element registry holds no
    // icon-set metadata. Defaults to "" until an icon set is loaded.
    private iconSetName = "";

    // Required (no default): a defaulted port would let a caller silently smuggle
    // DOM coupling back into this service. The stylesheet is injected from
    // outside so the service stays free of DOM/CSSOM detail.
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
     * Add or replace one icon while preserving Dictionary's general
     * first-write-wins contract.
     *
     * Artwork is shared by name: if the other category already selects the
     * same name, refresh its source too, but do not add that membership when it
     * was absent. Validation and sanitization finish before the first mutation
     * so a rejected update leaves every dictionary untouched.
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

        // Imports refresh names already present in the historical pool. Keep
        // entries absent from this import, but replace every incoming value
        // explicitly because Dictionary.set() never overwrites.
        currentIcons.keysArray().forEach((key) => {
            this.customIcons.delete(key);
            this.customIcons.set(key, currentIcons.get(key));
        });

        // Generate CSS for ALL custom icons in the current story's config
        this.addIconsToCss(currentIcons);

        // Import replaces (rather than merges into) the selected icon set:
        // hard-swap the selected dictionaries + name to the imported config.
        this.setIconSet(sanitizedConfig);
    }

    addIMGToIconDictionary(input: string, name: string): string {
        const sanitized = this.iconSanitizer.sanitize(input);
        this.customIcons.set(name, sanitized);
        return this.customIcons.get(name);
    }

    addIconsToCss(icons: Dictionary<string>) {
        // The service owns *which* class an icon maps to (getCSSClassOfIcon —
        // the issue-#4 regression pins class == published rule); the injected
        // port owns *how* that class becomes a live stylesheet rule.
        icons.keysArray().forEach((key) => {
            this.iconStyleSheet.addIconStyle(
                this.getCSSClassOfIcon(key),
                this.iconSanitizer.sanitize(icons.get(key)),
            );
        });
    }

    /** Getter & Setter **/

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
     * Resolves an icon by name through a single fallback order: the full custom
     * pool first, then the two selected dictionaries as a safety net for any
     * future registration path that bypasses the pool. Returns "" on a miss (not
     * a throw) so callers can keep their falsy guards live — a story element
     * whose icon is absent from the current set renders empty instead of
     * crashing the render pass.
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
