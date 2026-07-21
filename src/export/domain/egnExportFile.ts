import { DomainStory } from "../../domain/entities/domainStory";
import { IconSetExportConfiguration } from "../../domain/entities/iconSet";

/**
 * The EGN v4.0.0 on-disk envelope: an icon set paired with a story. Replaces
 * the legacy `{ domain, dst }` `ConfigAndDST`. Serializing an instance with
 * `JSON.stringify` yields exactly the `{ iconSet, domainStory }` file current
 * Egon.io reads and writes.
 */
export class EgnExportFile {
    constructor(
        readonly iconSet: IconSetExportConfiguration,
        readonly domainStory: DomainStory,
    ) {}
}
