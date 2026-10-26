/**
 * The story's framing: granularity, current vs. target state, and digital
 * detail, persisted since EGN v4.0.0. Ported verbatim from upstream: the enum
 * values are the exact on-disk tokens.
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
