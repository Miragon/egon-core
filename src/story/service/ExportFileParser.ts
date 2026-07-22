import { DomainStory } from "../domain/domainStory";
import { BusinessObject } from "../domain/businessObject";
import { FileConfiguration } from "../../iconSet/service";

/**
 * Normalizes the several on-disk EGN shapes into one `{ iconSetConfiguration,
 * domainStory }` pair before anything touches the canvas. Ported from upstream
 * Egon.io's `exportToDomainStory` + `extractIconSet` so this library reads
 * everything current and historical Egon.io writes:
 *
 * - v4.0.0: `{ iconSet, domainStory: { businessObjects, … } }`
 * - ≤3.0.0: `{ domain, dst: [ …elements, {info}, {version} ] }`
 * - v1.x quirk: `domain` and `dst` are JSON *strings*, not objects — the raw
 *   pass-through of these strings is the live crash this port fixes.
 * - bare legacy array: the top-level JSON is the element array itself.
 *
 * Anything else is rejected with an Error. The importer clears the canvas only
 * after parsing succeeds, so failing here keeps the user's current diagram
 * intact when a host passes a file that is not a domain story at all.
 *
 * Kept in the import layer (not the framework-free domain) because it is pure
 * parsing/adapter logic, and pure functions so the branch matrix is unit
 * testable without a canvas.
 */

/** Treats only `null`/`undefined` as absent — "", 0 and [] are present. */
function isPresent(value: unknown): boolean {
    return value !== undefined && value !== null;
}

/**
 * Splits a parsed export file into the icon-set configuration and the story.
 * The icon-set configuration is the raw `{ name?, actors, workObjects }` object
 * (already string-decoded) ready for `createIconSetConfiguration`; `undefined`
 * when the file carries no icon set (oldest legacy files).
 */
export function parseExportFile(parsed: any): {
    iconSetConfiguration: FileConfiguration | undefined;
    domainStory: DomainStory;
} {
    return {
        iconSetConfiguration: extractIconSetConfiguration(parsed),
        domainStory: extractDomainStory(parsed),
    };
}

/**
 * Reads the icon set from either `iconSet` (v4) or `domain` (legacy). A string
 * payload (v1.x wrote `domain` as JSON text) is decoded here — passing it on
 * raw is exactly what crashed the previous importer.
 */
export function extractIconSetConfiguration(
    parsed: any,
): FileConfiguration | undefined {
    const raw = isPresent(parsed?.iconSet) ? parsed.iconSet : parsed?.domain;
    if (!isPresent(raw)) {
        return undefined;
    }
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

/**
 * Reconstructs the `DomainStory` from whichever story shape the file uses,
 * preferring the v4 `domainStory` object over the legacy `dst` array. Title
 * defaults to "" (upstream derives it from the filename, which we do not have
 * at this layer).
 *
 * @throws Error when the payload matches none of the known shapes — a silent
 * empty story would let the importer wipe the current diagram on a wrong file.
 */
export function extractDomainStory(parsed: any): DomainStory {
    const domainStory: DomainStory = {
        businessObjects: [],
        version: "?",
        description: "",
        title: "",
    };

    // Neither key present → the only remaining known shape is the bare
    // element array.
    if (!isPresent(parsed?.dst) && !isPresent(parsed?.domainStory)) {
        if (!Array.isArray(parsed)) {
            throw unrecognizedFormatError();
        }
        return extractFromBareArray(parsed, domainStory);
    }

    let content = isPresent(parsed.domainStory)
        ? parsed.domainStory
        : parsed.dst;

    // v4 object: businessObjects + story metadata live side by side.
    if (Array.isArray(content?.businessObjects)) {
        domainStory.businessObjects = content.businessObjects;
        if (isPresent(content.version)) {
            domainStory.version = content.version;
        }
        if (isPresent(content.description)) {
            domainStory.description = content.description;
        }
        if (isPresent(content.title)) {
            domainStory.title = content.title;
        }
        if (isPresent(content.scope)) {
            domainStory.scope = content.scope;
        }
        return domainStory;
    }

    if (typeof content === "string") {
        // v1.x stored `dst` as a JSON string — decode before iterating.
        content = JSON.parse(content);
    }

    if (!Array.isArray(content)) {
        throw unrecognizedFormatError();
    }

    extractFromElementArray(content, domainStory);
    return domainStory;
}

/**
 * Legacy `dst` array walk: elements carry a `type`; the web export appends two
 * trailer objects, `{info}` (→ description) and `{version}` (→ version).
 */
function extractFromElementArray(
    content: any[],
    domainStory: DomainStory,
): void {
    content.forEach((element: any) => {
        if (hasOwn(element, "type")) {
            domainStory.businessObjects.push(
                Object.assign({} as BusinessObject, element),
            );
        }
        if (hasOwn(element, "info")) {
            domainStory.description = element.info;
        }
        if (hasOwn(element, "version")) {
            domainStory.version = element.version;
        }
    });
}

/**
 * Oldest format: the file *is* the element array, with the version/info folded
 * in as sibling entries rather than trailer objects.
 */
function extractFromBareArray(
    parsed: any[],
    domainStory: DomainStory,
): DomainStory {
    parsed.forEach((entry: any) => {
        if (entry?.type) {
            domainStory.businessObjects.push(entry);
        } else if (entry?.version) {
            domainStory.version = entry.version;
        } else if (entry?.info) {
            domainStory.description = entry.info;
        }
    });
    return domainStory;
}

function unrecognizedFormatError(): Error {
    return new Error(
        "Unrecognized domain story file: expected an EGN v4 { iconSet, domainStory } object, a legacy { domain, dst } object, or a bare element array",
    );
}

function hasOwn(value: any, key: string): boolean {
    return (
        value != null &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, key)
    );
}
