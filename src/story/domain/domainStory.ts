import { BusinessObject } from "./businessObject";
import { Scope } from "./scope";

/**
 * Mirrors upstream's on-disk `domainStory`, carrying the metadata the
 * diagram-js registry does not hold. `version` is the format the story was read
 * from ("?" when unknown); exports write "4.0.0".
 */
export interface DomainStory {
    businessObjects: BusinessObject[];
    description: string;
    version: string;
    title: string;
    scope?: Scope;
}
