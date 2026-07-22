import { BusinessObject } from "./businessObject";
import { Scope } from "./scope";

/**
 * The story half of an EGN v4.0.0 export: the diagram elements plus the
 * story-level metadata (title, description, scope) that the diagram-js element
 * registry does not hold. Mirrors upstream Egon.io's on-disk `domainStory`
 * object so a single value survives the open→save round-trip.
 *
 * `version` records the format the story was read from ("?" when unknown for
 * legacy imports); exports converge on "4.0.0".
 */
export interface DomainStory {
    businessObjects: BusinessObject[];
    description: string;
    version: string;
    title: string;
    scope?: Scope;
}
