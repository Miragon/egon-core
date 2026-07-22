import type { Scope } from "../../../domain/entities/scope";
import type { IconSetExportConfiguration } from "../../../domain/entities/iconSet";

/**
 * A complete domain story document in the EGN v4.0.0 shape.
 *
 * It is deliberately structurally identical to the on-disk file, so the modeler
 * adapter round-trips it with a plain `JSON.stringify`/`JSON.parse` and needs no
 * field mapping. `iconSet` and `Scope` reuse the shared domain DTOs (both
 * dependency-free) rather than duplicating them, keeping a single source of
 * truth for the wire format.
 */
export interface DomainStoryDocument {
    readonly iconSet: IconSetExportConfiguration;
    readonly domainStory: DomainStoryContent;
}

/** The story half of a {@link DomainStoryDocument}: elements plus metadata. */
export interface DomainStoryContent {
    readonly businessObjects: readonly DomainStoryElement[];
    readonly title: string;
    readonly description: string;
    readonly version: string;
    readonly scope?: Scope;
}

export type DomainStoryElement = unknown; // Validated during import
