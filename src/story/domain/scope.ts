/**
 * Describes the analytical framing of a domain story: how coarse it is, whether
 * it depicts the current or a target state, and whether it includes digital
 * detail. Introduced with the EGN v4.0.0 file format so this framing is
 * persisted alongside the story instead of being lost on save.
 *
 * Ported verbatim from upstream Egon.io (wps/egon.io) to stay wire-compatible;
 * the string enum values are the exact tokens written to and read from disk.
 */
export interface Scope {
    granularity?: Granularity_Grain | Granularity_Goal;
    pointInTime?: PointInTime;
    domainPurity?: DomainPurity;
}

export enum PointInTime {
    AS_IS = "as-is",
    TO_BE = "to-be",
}

export enum DomainPurity {
    PURE = "pure",
    DIGITALIZED = "digitalized",
}

export enum Granularity_Grain {
    COARSE = "coarse-grained",
    MEDIUM = "medium-grained",
    FINE = "fine-grained",
}

export enum Granularity_Goal {
    CLOUD = "cloud-level",
    KITE = "kite-level",
    SEA = "sea-level",
    FISH = "fish-level",
    CLAM = "clam-level",
}
