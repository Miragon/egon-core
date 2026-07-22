import { Dictionary } from "./dictionary";

/**
 * The actor/work-object icon vocabulary a story is drawn with. `name` was
 * re-added with the EGN v4.0.0 format so a named icon set survives an
 * open→save round-trip; it defaults to "" when a file omits it.
 */
export interface IconSet {
    name: string;
    actors: Dictionary;
    workObjects: Dictionary;
}

/**
 * The serialized (on-disk) form of an icon set: plain name→SVG maps rather than
 * the in-memory {@link Dictionary}. This is the shape written under `iconSet`
 * in an EGN v4.0.0 export. Kept in the domain so both the icon-set service and
 * the export envelope value object can reference it without either reaching
 * across layers.
 */
export interface IconSetExportConfiguration {
    name: string;
    actors: { [name: string]: string };
    workObjects: { [name: string]: string };
}
