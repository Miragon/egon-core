import { Scope } from "../entities/scope";

/**
 * Session-scoped holder for the story-level metadata that the diagram-js
 * element registry cannot express: title, description, scope and the version
 * the story was imported from.
 *
 * Exists to bridge import and export. `export()` takes no arguments and
 * reconstructs the story purely from the element registry, so without this
 * service the title/description/scope read on import would be dropped on the
 * next save. Import writes here; export reads back. Mirrors upstream Egon.io's
 * PropertiesService and follows the dependency-free singleton pattern of
 * [[DirtyFlagService]].
 */
export class DomainStoryPropertiesService {
    static $inject: string[] = [];

    private title = "";
    private description = "";
    private version = "";
    private scope: Scope | undefined = undefined;

    /** Overwrites the current metadata; called once per successful import. */
    setProperties(
        title: string,
        description: string,
        scope: Scope | undefined,
        version: string,
    ): void {
        this.title = title;
        this.description = description;
        this.scope = scope;
        this.version = version;
    }

    getTitle(): string {
        return this.title;
    }

    getDescription(): string {
        return this.description;
    }

    getScope(): Scope | undefined {
        return this.scope;
    }

    getVersion(): string {
        return this.version;
    }
}
