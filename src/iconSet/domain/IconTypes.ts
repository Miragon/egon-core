/** Icon DTOs only; `IconDictionaryService` is the single source of truth. */

/** Map of icon names to SVG content */
export interface IconMap {
    readonly [name: string]: string;
}

/** Icons for actors and work objects, as a detached DTO. */
export interface IconSet {
    readonly actors: IconMap;
    readonly workObjects: IconMap;
}

/** Partial icon set for loading operations */
export type IconSetData = {
    /**
     * Icon-set name written to EGN v4 exports. Optional so icon-only callers
     * need not care; when omitted, the currently loaded name is kept.
     */
    readonly name?: string;
    readonly actors?: IconMap;
    readonly workObjects?: IconMap;
};

/** Icon category for identifying icon type */
export type IconCategory = "actor" | "workObject";

export type IconNamesByCategory = Readonly<
    Record<IconCategory, readonly string[]>
>;

/** Complete, detached icon configuration snapshot. */
export interface IconConfiguration {
    readonly name: string;
    /** All retained custom artwork, including icons used by live shapes. */
    readonly catalog: IconMap;
    /** Ordered palette selections. */
    readonly selected: IconNamesByCategory;
    /** Distinct icon names referenced by the current story. */
    readonly used: IconNamesByCategory;
}
