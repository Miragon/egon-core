import { DomainStory } from "./domainStory";
import { IconSetExportConfiguration } from "./iconSet";

/**
 * The EGN v4.0.0 envelope: `JSON.stringify` of an instance yields exactly the
 * `{ iconSet, domainStory }` file Egon.io reads and writes.
 */
export class EgnExportFile {
    constructor(
        readonly iconSet: IconSetExportConfiguration,
        readonly domainStory: DomainStory,
    ) {}
}
