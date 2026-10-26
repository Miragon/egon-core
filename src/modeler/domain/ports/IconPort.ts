import {
    IconConfiguration,
    IconSet,
    IconSetData,
    IconCategory,
} from "../../../iconSet/domain/IconTypes";

export interface IconPort {
    /**
     * **Replaces** the current icon set: an omitted category becomes empty.
     * To merge, spread {@link getIcons} into the new set.
     */
    loadIcons(icons: Partial<IconSetData>): void;

    /**
     * Replaces an existing name and repaints matching shapes. Artwork is shared
     * by name, so a selected same-name entry in the other category refreshes too.
     */
    addIcon(category: IconCategory, name: string, svg: string): void;

    removeIcon(category: IconCategory, name: string): void;

    getIcons(): IconSet;

    /** Returns the retained catalog, selection order, set name, and usage. */
    getIconConfiguration(): IconConfiguration;

    /** Reorders one selected category using an exact permutation. */
    setIconOrder(category: IconCategory, names: readonly string[]): void;

    hasIcon(category: IconCategory, name: string): boolean;

    /** Idempotent per callback; one matching {@link offIconsChanged} removes it. */
    onIconsChanged(callback: (icons: IconSet) => void): void;

    /** Also cancels a pending debounced delivery. */
    offIconsChanged(callback: (icons: IconSet) => void): void;

    destroy(): void;
}
