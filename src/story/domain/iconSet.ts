import { Dictionary } from "./dictionary";

/**
 * The actor/work-object icons a story is drawn with. `name` lets a named icon
 * set survive open→save; it defaults to "" when a file omits it.
 */
export interface IconSet {
    name: string;
    actors: Dictionary<string>;
    workObjects: Dictionary<string>;
}

/**
 * The on-disk form of an icon set (`iconSet` in an EGN v4.0.0 export): plain
 * name→SVG maps rather than the in-memory {@link Dictionary}.
 */
export interface IconSetExportConfiguration {
    name: string;
    actors: { [name: string]: string };
    workObjects: { [name: string]: string };
}
