import { DomainStory } from "../domain/domainStory";
import { BusinessObject } from "../domain/businessObject";
import { FileConfiguration } from "../../iconSet/service";
import {
    DomainPurity,
    Granularity_Goal,
    Granularity_Grain,
    PointInTime,
    Scope,
} from "../domain/scope";
import {
    isActivity,
    isConnection,
    isDomainStoryElement,
} from "../domain/elementPredicates";

interface ImportRecord extends Record<string, unknown> {
    iconSet?: unknown;
    domain?: unknown;
    config?: unknown;
    actors?: unknown;
    workObjects?: unknown;
    dst?: unknown;
    domainStory?: unknown;
    businessObjects?: unknown;
    version?: unknown;
    description?: unknown;
    title?: unknown;
    scope?: unknown;
    info?: unknown;
    id?: unknown;
    type?: unknown;
    name?: unknown;
    text?: unknown;
    pickedColor?: unknown;
    parent?: unknown;
    children?: unknown;
    number?: unknown;
    multipleNumberAllowed?: unknown;
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
    source?: unknown;
    target?: unknown;
    waypoints?: unknown;
    original?: unknown;
    granularity?: unknown;
    pointInTime?: unknown;
    domainPurity?: unknown;
}

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
 * Anything else is rejected with an Error. Public import prepares this data
 * before constructing a candidate editor, so failing here leaves the active
 * diagram intact when a host passes a file that is not a domain story at all.
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
export function parseExportFile(parsed: unknown): {
    iconSetConfiguration: FileConfiguration | undefined;
    domainStory: DomainStory;
} {
    const iconSetConfiguration = extractIconSetConfiguration(parsed);
    const domainStory = extractDomainStory(parsed);

    validateMetadata(domainStory);
    domainStory.businessObjects = validateElements(domainStory.businessObjects);

    return { iconSetConfiguration, domainStory };
}

/**
 * Reads the icon set from `iconSet` (v4), `domain` (legacy) or `config` (the
 * oldest key), newest first. Dropping `config` meant an old
 * `{ config, dst }` file imported with an empty icon set — blank shapes on
 * canvas, and the next export wrote that emptiness back permanently.
 *
 * A string payload (the older keys were written as JSON text) is decoded here;
 * passing it on raw is exactly what crashed the previous importer.
 */
export function extractIconSetConfiguration(
    parsed: unknown,
): FileConfiguration | undefined {
    const envelope = asOptionalRecord(parsed);
    const raw = envelope
        ? [envelope.iconSet, envelope.domain, envelope.config].find(isPresent)
        : undefined;
    if (!isPresent(raw)) {
        return undefined;
    }
    const decoded = typeof raw === "string" ? parseJson(raw, "iconSet") : raw;
    const configuration = requireRecord(decoded, "iconSet");
    const name = optionalString(configuration, "name", "iconSet.name") ?? "";
    const actors = validateIconDictionary(
        configuration.actors,
        "iconSet.actors",
    );
    const workObjects = validateIconDictionary(
        configuration.workObjects,
        "iconSet.workObjects",
    );

    return { name, actors, workObjects };
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
export function extractDomainStory(parsed: unknown): DomainStory {
    const domainStory: DomainStory = {
        businessObjects: [],
        version: "?",
        description: "",
        title: "",
    };

    // Neither key present → the only remaining known shape is the bare
    // element array.
    const envelope = asOptionalRecord(parsed);
    if (!isPresent(envelope?.dst) && !isPresent(envelope?.domainStory)) {
        if (!Array.isArray(parsed)) {
            throw unrecognizedFormatError();
        }
        return extractFromBareArray(parsed, domainStory);
    }

    let content = isPresent(envelope?.domainStory)
        ? envelope!.domainStory
        : envelope!.dst;

    // v4 object: businessObjects + story metadata live side by side.
    const contentRecord = asOptionalRecord(content);
    if (Array.isArray(contentRecord?.businessObjects)) {
        domainStory.businessObjects =
            contentRecord.businessObjects as BusinessObject[];
        if (hasOwn(contentRecord, "version")) {
            domainStory.version = contentRecord.version as string;
        }
        if (hasOwn(contentRecord, "description")) {
            domainStory.description = contentRecord.description as string;
        }
        if (hasOwn(contentRecord, "title")) {
            domainStory.title = contentRecord.title as string;
        }
        if (hasOwn(contentRecord, "scope")) {
            domainStory.scope = contentRecord.scope as Scope;
        }
        return domainStory;
    }

    if (typeof content === "string") {
        // v1.x stored `dst` as a JSON string — decode before iterating.
        content = parseJson(content, "domainStory");
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
    content: unknown[],
    domainStory: DomainStory,
): void {
    content.forEach((element: unknown) => {
        if (hasOwn(element, "type")) {
            domainStory.businessObjects.push(
                Object.assign({} as BusinessObject, element),
            );
        }
        if (hasOwn(element, "info")) {
            domainStory.description = (element as ImportRecord).info as string;
        }
        if (hasOwn(element, "version")) {
            domainStory.version = (element as ImportRecord).version as string;
        }
    });
}

/**
 * Oldest format: the file *is* the element array, with the version/info folded
 * in as sibling entries rather than trailer objects.
 */
function extractFromBareArray(
    parsed: unknown[],
    domainStory: DomainStory,
): DomainStory {
    parsed.forEach((entry: unknown) => {
        const record = asOptionalRecord(entry);
        if (record?.type) {
            domainStory.businessObjects.push(
                record as unknown as BusinessObject,
            );
        } else if (record?.version) {
            domainStory.version = record.version as string;
        } else if (record?.info) {
            domainStory.description = record.info as string;
        }
    });
    return domainStory;
}

function unrecognizedFormatError(): Error {
    return new Error(
        "Unrecognized domain story file: expected an EGN v4 { iconSet, domainStory } object, a legacy { domain, dst } object, or a bare element array",
    );
}

function hasOwn(value: unknown, key: string): boolean {
    return (
        value != null &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, key)
    );
}

const RESERVED_ID_PREFIX = "__implicitroot";
const VALID_GRANULARITIES: readonly string[] = [
    ...Object.values(Granularity_Grain),
    ...Object.values(Granularity_Goal),
];
const VALID_POINTS_IN_TIME: readonly string[] = Object.values(PointInTime);
const VALID_DOMAIN_PURITY: readonly string[] = Object.values(DomainPurity);
const BOOKKEEPING_FIELDS: readonly string[] = [
    "businessObject",
    "get",
    "set",
    "$instanceOf",
    "incoming",
    "outgoing",
    "attachers",
    "host",
    "labels",
];

function validateMetadata(domainStory: DomainStory): void {
    assertString(domainStory.title, "domainStory.title");
    assertString(domainStory.description, "domainStory.description");
    assertString(domainStory.version, "domainStory.version");

    if (domainStory.scope === undefined) return;

    const scope = requireRecord(domainStory.scope, "domainStory.scope");
    validateEnum(scope, "granularity", VALID_GRANULARITIES);
    validateEnum(scope, "pointInTime", VALID_POINTS_IN_TIME);
    validateEnum(scope, "domainPurity", VALID_DOMAIN_PURITY);
    domainStory.scope = {
        ...(scope.granularity !== undefined
            ? { granularity: scope.granularity as Scope["granularity"] }
            : {}),
        ...(scope.pointInTime !== undefined
            ? { pointInTime: scope.pointInTime as PointInTime }
            : {}),
        ...(scope.domainPurity !== undefined
            ? { domainPurity: scope.domainPurity as DomainPurity }
            : {}),
    };
}

function validateElements(elements: readonly unknown[]): BusinessObject[] {
    const result: BusinessObject[] = [];
    const ids = new Set<string>();

    elements.forEach((value, index) => {
        const path = `domainStory.businessObjects[${index}]`;
        const record = requireRecord(value, path);
        const id = requiredString(record, "id", `${path}.id`);
        const type = requiredString(record, "type", `${path}.type`);
        const elementPath = `${path} (element ${JSON.stringify(id)})`;

        if (ids.has(id)) {
            throw new Error(
                `${elementPath}.id: duplicate element id ${JSON.stringify(id)}`,
            );
        }
        if (id.startsWith(RESERVED_ID_PREFIX)) {
            throw new Error(
                `${elementPath}.id: reserved element id ${JSON.stringify(id)}`,
            );
        }
        if (!isDomainStoryElement({ type })) {
            throw new Error(
                `${elementPath}.type: unsupported element family ${JSON.stringify(type)}`,
            );
        }

        const edge = isActivity({ type }) || isConnection({ type });
        if (!edge && !isSupportedShapeType(type)) {
            throw new Error(
                `${elementPath}.type: unsupported element family ${JSON.stringify(type)}`,
            );
        }

        ids.add(id);
        validateOptionalRenderingFields(record, elementPath);
        if (edge) {
            requiredString(record, "source", `${elementPath}.source`);
            requiredString(record, "target", `${elementPath}.target`);
        } else {
            finiteNumber(record.x, `${elementPath}.x`);
            finiteNumber(record.y, `${elementPath}.y`);
            positiveOptionalNumber(record, "width", elementPath);
            positiveOptionalNumber(record, "height", elementPath);
        }

        result.push(copyBusinessObject(record, id, type));
    });

    return result;
}

/** Validate geometry only after dangling connections have been repaired away. */
export function validateRetainedGeometry(
    elements: readonly BusinessObject[],
): void {
    for (const element of elements) {
        const record = element as unknown as ImportRecord;
        const path = `element ${JSON.stringify(element.id)}`;
        if (isActivity(element) || isConnection(element)) {
            if (
                !Array.isArray(record.waypoints) ||
                record.waypoints.length < 2
            ) {
                throw new Error(
                    `${path}.waypoints: retained connections require at least two waypoints`,
                );
            }
            record.waypoints = record.waypoints.map((value, index) => {
                const waypointPath = `${path}.waypoints[${index}]`;
                const waypoint = requireRecord(value, waypointPath);
                finiteNumber(waypoint.x, `${waypointPath}.x`);
                finiteNumber(waypoint.y, `${waypointPath}.y`);
                if (waypoint.original !== undefined) {
                    const original = requireRecord(
                        waypoint.original,
                        `${waypointPath}.original`,
                    );
                    finiteNumber(original.x, `${waypointPath}.original.x`);
                    finiteNumber(original.y, `${waypointPath}.original.y`);
                }

                // Keep the source order of the three supported keys so an
                // untouched save/open/save remains byte-stable, while dropping
                // unchecked extras before diagram-js sees the point.
                const prepared: ImportRecord = {};
                Object.keys(waypoint).forEach((key) => {
                    if (key === "x" || key === "y") {
                        prepared[key] = waypoint[key];
                    } else if (key === "original") {
                        const original = waypoint.original as ImportRecord;
                        const preparedOriginal: ImportRecord = {};
                        Object.keys(original).forEach((originalKey) => {
                            if (originalKey === "x" || originalKey === "y") {
                                preparedOriginal[originalKey] =
                                    original[originalKey];
                            }
                        });
                        prepared.original = preparedOriginal;
                    }
                });
                return prepared;
            });
        } else {
            finiteNumber(record.x, `${path}.x`);
            finiteNumber(record.y, `${path}.y`);
            positiveOptionalNumber(record, "width", path);
            positiveOptionalNumber(record, "height", path);
        }
    }
}

function isSupportedShapeType(type: string): boolean {
    return [
        "domainStory:actor",
        "domainStory:workObject",
        "domainStory:group",
        "domainStory:textAnnotation",
    ].some((prefix) => type.startsWith(prefix));
}

function validateOptionalRenderingFields(
    record: ImportRecord,
    path: string,
): void {
    optionalString(record, "name", `${path}.name`);
    optionalString(record, "text", `${path}.text`);
    optionalString(record, "pickedColor", `${path}.pickedColor`);
    optionalString(record, "parent", `${path}.parent`);
    if (record.children !== undefined) {
        if (
            !Array.isArray(record.children) ||
            !record.children.every((child) => typeof child === "string")
        ) {
            throw new Error(`${path}.children: expected an array of strings`);
        }
    }
    if (record.number !== undefined && record.number !== null) {
        finiteNumber(record.number, `${path}.number`);
    }
    if (
        record.multipleNumberAllowed !== undefined &&
        typeof record.multipleNumberAllowed !== "boolean"
    ) {
        throw new Error(`${path}.multipleNumberAllowed: expected a boolean`);
    }
}

function copyBusinessObject(
    source: ImportRecord,
    id: string,
    type: string,
): BusinessObject {
    const copy: ImportRecord = {};
    for (const key of Object.keys(source)) {
        if (!BOOKKEEPING_FIELDS.includes(key)) {
            Object.defineProperty(copy, key, {
                value: cloneImportValue(source[key]),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
    }
    copy.id = id;
    copy.type = type;
    copy.name ??= "";
    return copy as unknown as BusinessObject;
}

function cloneImportValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cloneImportValue);
    const record = asOptionalRecord(value);
    if (!record) return value;
    const copy: ImportRecord = {};
    for (const key of Object.keys(record)) {
        Object.defineProperty(copy, key, {
            value: cloneImportValue(record[key]),
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return copy;
}

function validateIconDictionary(
    value: unknown,
    path: string,
): Record<string, string> {
    const source = requireRecord(value, path);
    const result: Record<string, string> = {};
    for (const name of Object.keys(source)) {
        const icon = source[name];
        if (typeof icon !== "string") {
            throw new Error(
                `${path}[${JSON.stringify(name)}]: expected an icon source string`,
            );
        }
        Object.defineProperty(result, name, {
            value: icon,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return result;
}

function validateEnum(
    record: ImportRecord,
    key: string,
    accepted: readonly string[],
): void {
    const value = record[key];
    if (
        value !== undefined &&
        (typeof value !== "string" || !accepted.includes(value))
    ) {
        throw new Error(
            `domainStory.scope.${key}: invalid value ${JSON.stringify(value)}`,
        );
    }
}

function positiveOptionalNumber(
    record: ImportRecord,
    key: string,
    path: string,
): void {
    if (record[key] === undefined) return;
    const value = finiteNumber(record[key], `${path}.${key}`);
    if (value <= 0)
        throw new Error(`${path}.${key}: expected a positive number`);
}

function finiteNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}: expected a finite number`);
    }
    return value;
}

function requiredString(
    record: ImportRecord,
    key: string,
    path: string,
): string {
    const value = record[key];
    assertString(value, path);
    if (value.length === 0)
        throw new Error(`${path}: expected a non-empty string`);
    return value;
}

function optionalString(
    record: ImportRecord,
    key: string,
    path: string,
): string | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    assertString(value, path);
    return value;
}

function assertString(value: unknown, path: string): asserts value is string {
    if (typeof value !== "string")
        throw new Error(`${path}: expected a string`);
}

function requireRecord(value: unknown, path: string): ImportRecord {
    const record = asOptionalRecord(value);
    if (!record) throw new Error(`${path}: expected an object`);
    return record;
}

function asOptionalRecord(value: unknown): ImportRecord | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as ImportRecord)
        : undefined;
}

function parseJson(value: string, path: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`${path}: invalid JSON`);
    }
}
