import { Scope } from "../../story/domain/scope";

/**
 * Holds story metadata the element registry cannot express (title,
 * description, scope, imported version), so export can write back what import
 * read. Upstream: PropertiesService.
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
