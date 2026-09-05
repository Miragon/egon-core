import {
    IconSet,
    IconSetData,
    IconCategory,
} from "../../../iconSet/domain/IconTypes";

/**
 * Port interface for icon management operations.
 * Infrastructure layer provides the concrete implementation.
 */
export interface IconPort {
    /**
     * Load a set of icons into the modeler, **replacing** the current icon set.
     * A category left out of `icons` becomes empty; to merge, spread
     * {@link getIcons} into the new set.
     */
    loadIcons(icons: Partial<IconSetData>): void;

    /**
     * Add a single icon.
     */
    addIcon(category: IconCategory, name: string, svg: string): void;

    /**
     * Remove an icon.
     */
    removeIcon(category: IconCategory, name: string): void;

    /**
     * Get all currently registered icons.
     */
    getIcons(): IconSet;

    /**
     * Check if an icon exists.
     */
    hasIcon(category: IconCategory, name: string): boolean;

    /**
     * Subscribe to icon changes. Duplicate registration of the same callback
     * is ignored; one matching {@link offIconsChanged} fully removes it.
     */
    onIconsChanged(callback: (icons: IconSet) => void): void;

    /**
     * Unsubscribe from icon changes, including any pending debounced delivery.
     */
    offIconsChanged(callback: (icons: IconSet) => void): void;

    /**
     * Clean up resources.
     */
    destroy(): void;
}
