import type { Scope } from "./scope";
import type { IconSetExportConfiguration } from "./iconSet";

/**
 * A complete domain story in the EGN v4.0.0 shape. It is structurally identical
 * to the file, so it round-trips through plain `JSON.stringify`/`JSON.parse`.
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
