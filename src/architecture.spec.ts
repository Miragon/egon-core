import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractGraph, projectFiles } from "archunit";

/**
 * Executable architecture tests — the enforcement half of
 * docs/adr/0010-flat-ddd-feature-layout-and-frozen-public-api.md (which
 * supersedes 0005). They turn the layout rules (framework-free domain layers,
 * per-feature hexagons, sibling isolation, one sanctioned composition root per
 * feature, and a frozen public API) into CI gates so regressions break the
 * build instead of rotting silently. All rules are regression locks that must
 * stay green; do not relax a rule to make CI pass — that defeats the gate.
 *
 * Two mechanisms are combined deliberately:
 * - archunit's import graph for project-internal rules (cycles, folder
 *   dependencies). A sanity test guards against the resolver silently
 *   returning an empty graph, which would make every graph rule pass
 *   vacuously.
 * - raw-source text scans for anything archunit's graph cannot see: external
 *   package imports (the graph drops them entirely under this tsconfig) and
 *   dynamic `import()` calls (no edge is produced for them).
 */
// __dirname rather than import.meta.url: the base tsconfig typechecks with
// `module: commonjs`, which rejects import.meta; vitest's vite-node runtime
// provides __dirname either way.
const REPO_ROOT = resolve(__dirname, "..");
const TSCONFIG = resolve(REPO_ROOT, "tsconfig.lib.json");

type Edge = Awaited<ReturnType<typeof extractGraph>>[number];

/**
 * Module specifiers a file imports, drawn from every import/require form.
 * Read from source text because archunit's graph exposes neither external
 * imports nor dynamic `import()` edges. The patterns require the
 * `from`/`import`/`require` keyword next to a quoted specifier, so prose
 * mentions in comments don't match — but a commented-out import still would,
 * since the scan does no comment stripping.
 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
    /\bfrom\s*["']([^"']+)["']/g, // import … from "x";  export … from "x"
    /\bimport\s+["']([^"']+)["']/g, // import "x";  (side-effect)
    /\bimport\s*\(\s*["']([^"']+)["']/g, // import("x")  (dynamic)
    /\brequire\s*\(\s*["']([^"']+)["']/g, // require("x")
];

function importedModules(content: string): string[] {
    return SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...content.matchAll(pattern)].map((match) => match[1]),
    );
}

/**
 * All non-test `.ts`/`.tsx` files under `src/`, as repo-relative POSIX paths.
 * `.tsx` is included so the shared UI components (`shared/infrastructure/ui/*`)
 * are visible to the raw-source scans below — otherwise a `.tsx` file could
 * import across boundaries unchecked.
 */
function listSourceFiles(): string[] {
    const srcRoot = resolve(REPO_ROOT, "src");
    const files: string[] = [];
    const walk = (absoluteDir: string): void => {
        for (const entry of readdirSync(absoluteDir)) {
            const absolutePath = join(absoluteDir, entry);
            if (statSync(absolutePath).isDirectory()) {
                if (entry !== "__tests__") {
                    walk(absolutePath);
                }
            } else if (
                /\.tsx?$/.test(entry) &&
                !/\.(spec|test)\.tsx?$/.test(entry)
            ) {
                files.push(
                    `src/${absolutePath
                        .slice(srcRoot.length + 1)
                        .split("\\")
                        .join("/")}`,
                );
            }
        }
    };
    walk(srcRoot);
    return files;
}

function readSource(repoRelativePath: string): string {
    return readFileSync(resolve(REPO_ROOT, repoRelativePath), "utf8");
}

/**
 * Every `domain/` layer is innermost, wherever it lives: the per-feature
 * domain folders (`src/modeler/domain/…`, `src/story/domain/…`,
 * `src/labelDictionary/domain/…`, `src/iconSet/domain/…`).
 */
function isDomainFile(repoRelativePath: string): boolean {
    return repoRelativePath.includes("/domain/");
}

/** A file living in some feature's `service/` layer (`src/<F>/service/…`). */
function isServiceFile(repoRelativePath: string): boolean {
    return /^src\/[^/]+\/service\//.test(repoRelativePath);
}

/** The owning feature of a source file: the first path segment under `src/`. */
function featureOf(repoRelativePath: string): string {
    return repoRelativePath.split("/")[1] ?? "";
}

/**
 * Resolves a relative import `specifier` written in `fromFile` to a normalized
 * repo-relative `src/…` path (with any trailing `/index` stripped, so a barrel
 * import and its explicit-`/index` form compare equal). Returns `null` for
 * package/platform specifiers — those are out of scope for the boundary scans
 * and handled by the domain-purity and framework rules instead.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) {
        return null;
    }
    const fromDir = fromFile.split("/").slice(0, -1);
    const segments = [...fromDir, ...specifier.split("/")];
    const resolved: string[] = [];
    for (const segment of segments) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === "..") {
            resolved.pop();
        } else {
            resolved.push(segment);
        }
    }
    return resolved.join("/").replace(/\/index$/, "");
}

/**
 * The only service-layer files allowed to reference infrastructure: each is a
 * feature's composition root, wiring adapters that implement domain ports. Any
 * other service file reaching into infrastructure is a hexagon violation.
 */
const COMPOSITION_ROOT_ALLOWLIST: readonly string[] = [
    "src/modeler/service/EgonClient.ts", // dynamic import() of the diagram-js adapters
    "src/iconSet/service/index.ts", // wires IconCssInjector (IconStyleSheetPort)
    "src/story/service/importModule.ts", // wires VersionBoxBanner (VersionBannerPort)
];

/**
 * Feature roots that own a bounded context (or, for `shared`, the shared
 * kernel). Sibling isolation (rule F) is checked for files living under these;
 * `src/index.ts`, `src/types`, and `src/assets` are not origins — they are the
 * package barrel and shared-kernel leaves, governed by rules G and F's target
 * allowances respectively.
 */
const FEATURE_ROOTS: readonly string[] = [
    "modeler",
    "story",
    "iconSet",
    "labelDictionary",
    "shared",
];

/**
 * The frozen public surface. `src/index.ts` may import exactly these specifiers
 * (rule G1) and re-export exactly these runtime values (rule G2). Changing the
 * public API is a deliberate act that must update this list and ADR 0010, not an
 * accident that slips through review.
 */
const FROZEN_INDEX_SPECIFIERS: readonly string[] = [
    "./iconSet/domain/IconTypes",
    "./modeler/domain/model/Viewport",
    "./modeler/domain/ports/IconPort",
    "./modeler/domain/ports/ModelerPort",
    "./modeler/service/EgonClient",
    "./modeler/service/EgonClientConfig",
    "./story/domain/DomainStoryDocument",
    "./story/domain/iconSet",
    "./story/domain/scope",
];

const FROZEN_INDEX_RUNTIME_EXPORTS: readonly string[] = [
    "DomainPurity",
    "EgonClient",
    "Granularity_Goal",
    "Granularity_Grain",
    "PointInTime",
];

/**
 * Column-0 declarations that introduce mutable state at module scope (rule H).
 * Class members are indented, so anchoring at `^` (no leading whitespace)
 * restricts the scan to true module-level bindings. Non-empty literal config
 * (`DEFAULT_COLOR`, `NULL_DIMENSIONS`, didi module descriptors, `export const`
 * arrow functions) does not match, so those stay legal.
 */
const MODULE_STATE_PATTERNS: readonly RegExp[] = [
    /^(?:export\s+)?(?:let|var)\s/, // reassignable binding
    /^(?:export\s+)?const\s+[\w$]+(?:\s*:[^=]+)?\s*=\s*new\s/, // stateful instance
    /^(?:export\s+)?const\s+[\w$]+(?:\s*:[^=]+)?\s*=\s*\[\s*\]/, // empty-array accumulator
];

/**
 * Files permitted to hold module-level mutable state. Empty by design (rule H):
 * adding an entry is a deliberate, reviewed exception — never an accident.
 */
const MODULE_STATE_ALLOWLIST: readonly string[] = [];

/**
 * Writes a renderer may not perform (rule I / ADR 0016), in the two shapes the
 * historical ones actually took.
 *
 * 1. A direct assignment through `businessObject`/`semantic` — the local name
 *    every removed write used (`shape.businessObject.type = type`,
 *    `semantic.number = null`). `=(?!=)` keeps `==`/`===` out; `!==`/`>=`/`<=`
 *    cannot match because their leading character is not an accepted operator.
 * 2. `assign(` whose **first** argument is not an object or array literal.
 *    min-dash writes into that argument, which is how `drawAnnotation` stamped a
 *    height onto the element and its business object. The whitespace lives
 *    *inside* the lookaheads on purpose: with `\s*` before them the engine simply
 *    backtracks off the spaces and every call matches. The second lookahead
 *    tolerates the Prettier-wrapped `assign(\n    { … }` form, whose argument the
 *    scan sees because it joins each line with the next.
 *
 * Syntactic and therefore conservative: an alias (`const bo = element.businessObject`)
 * would slip past. This is a ratchet against the regression, not a proof of
 * purity — `RendererModelPurity.browser.spec.ts` repaints and diffs for that.
 */
const RENDERER_WRITE_PATTERNS: readonly RegExp[] = [
    /\b(?:businessObject|semantic)(?:\.\w+|\[[^\]]*\])+\s*(?:\+|-|\*|\/|\?\?|\|\||&&)?=(?!=)/,
    /\bassign\((?!\s*[{[])(?!\s*$)/,
];

/** A file under some feature's `renderer/` folder (not `text-renderer/`). */
function isRendererFile(repoRelativePath: string): boolean {
    return /(^|\/)renderer\//.test(repoRelativePath);
}

describe("architecture", () => {
    let edges: Edge[] = [];

    // archunit builds the TS import graph on first use and caches it by
    // tsconfig path; warming it here keeps every rule below fast and gives the
    // cold build a generous timeout instead of tripping the per-test default.
    beforeAll(async () => {
        edges = await extractGraph(TSCONFIG);
    }, 60_000);

    // ─── A. Graph sanity ─────────────────────────────────────────────────────
    //
    // If the resolver fails (wrong tsconfig path, moduleResolution quirks — see
    // ADR 0005), it degrades to an edge-less graph and every dependency rule
    // below passes without checking anything. Assert real cross-file edges
    // exist so that failure mode is loud.
    describe("graph sanity", () => {
        it("resolves cross-file dependencies", () => {
            const crossFileEdges = edges.filter(
                (edge) => !edge.external && edge.source !== edge.target,
            );
            expect(crossFileEdges.length).toBeGreaterThan(0);
        });
    });

    // ─── B. No import cycles ─────────────────────────────────────────────────
    describe("no cycles", () => {
        it("the source tree is free of import cycles", async () => {
            const violations = await projectFiles(TSCONFIG)
                .inFolder("src/**")
                .should()
                .haveNoCycles()
                .check();
            expect(violations).toEqual([]);
        });
    });

    // ─── C. Domain purity ────────────────────────────────────────────────────
    //
    // The domain model stays clean of dependencies: no framework, no platform,
    // no outer layer. External access goes through ports (e.g.
    // `ElementRegistryPort`), implemented by the outer layers and injected at
    // runtime.
    describe("domain purity", () => {
        it("domain layers import only relative modules", () => {
            const offenders = listSourceFiles()
                .filter(isDomainFile)
                .flatMap((file) =>
                    importedModules(readSource(file))
                        .filter((specifier) => !specifier.startsWith("."))
                        .map((specifier) => `${file} → ${specifier}`),
                );
            expect(
                offenders,
                `domain layers must not import packages or platform modules — ` +
                    `define a port instead`,
            ).toEqual([]);
        });

        it("domain layers depend only on domain files", () => {
            const offenders = edges
                .filter(
                    (edge) =>
                        !edge.external &&
                        edge.source !== edge.target &&
                        isDomainFile(edge.source) &&
                        !isDomainFile(edge.target),
                )
                .map((edge) => `${edge.source} → ${edge.target}`);
            expect(
                offenders,
                `domain layers must not reach outward into application, ` +
                    `infrastructure, or feature code`,
            ).toEqual([]);
        });
    });

    // ─── D. Modeler service is framework-free ────────────────────────────────
    //
    // Unlike story/labelDictionary (whose services are didi-registered diagram-js
    // services by nature), the modeler service layer is the pure use-case surface
    // behind EgonClient and must name no framework module. The single exception
    // is the type-only `didi` surface of `EgonClientConfig.additionalModules` in
    // the composition root. (Service→infrastructure layering is enforced for
    // every feature by rule E below; this rule only adds the framework ban, and
    // only for modeler — see ADR 0010's "deferred" note.)
    describe("modeler service is framework-free", () => {
        it("service imports no framework module except didi types in the composition root", () => {
            const offenders = listSourceFiles()
                .filter((file) => file.startsWith("src/modeler/service/"))
                .flatMap((file) => {
                    const allowed = file.endsWith("/EgonClient.ts")
                        ? ["didi"] // type-only DI surface of EgonClientConfig's additionalModules
                        : [];
                    return importedModules(readSource(file))
                        .filter(
                            (specifier) =>
                                !specifier.startsWith(".") &&
                                !allowed.includes(specifier),
                        )
                        .map((specifier) => `${file} → ${specifier}`);
                });
            expect(offenders).toEqual([]);
        });
    });

    // ─── E. Generalized hexagon (every feature) ──────────────────────────────
    //
    // Each feature is a ports-and-adapters context: its `service` layer reaches
    // the outside world only through `domain/ports`, and `infrastructure`
    // implements them. Only a feature's composition root may wire adapters — the
    // COMPOSITION_ROOT_ALLOWLIST. This subsumes the former modeler-only
    // service→infra rules and applies them to story/iconSet/labelDictionary too.
    describe("generalized hexagon", () => {
        // E1 (graph): static service→infrastructure edges, allowlist aside.
        it("no service layer statically depends on infrastructure outside its composition root", () => {
            const offenders = edges
                .filter(
                    (edge) =>
                        !edge.external &&
                        edge.source !== edge.target &&
                        isServiceFile(edge.source) &&
                        edge.target.includes("/infrastructure/") &&
                        !COMPOSITION_ROOT_ALLOWLIST.includes(edge.source),
                )
                .map((edge) => `${edge.source} → ${edge.target}`);
            expect(offenders).toEqual([]);
        });

        // E2 (raw scan): the graph produces no edge for a dynamic `import()`, so
        // a service file adopting the composition root's `import()` trick would
        // slip past E1 — this text scan closes that hole for every feature. The
        // allowlist keeps the sanctioned dynamic import in EgonClient legal.
        it("no service file outside a composition root names an infrastructure specifier", () => {
            const offenders = listSourceFiles()
                .filter(
                    (file) =>
                        isServiceFile(file) &&
                        !COMPOSITION_ROOT_ALLOWLIST.includes(file),
                )
                .flatMap((file) =>
                    importedModules(readSource(file))
                        .filter((specifier) =>
                            specifier.includes("infrastructure"),
                        )
                        .map((specifier) => `${file} → ${specifier}`),
                );
            expect(offenders).toEqual([]);
        });
    });

    // ─── F. Sibling isolation ────────────────────────────────────────────────
    //
    // A feature's public surface is its `domain/**` (pure by rule C) plus its
    // `service` barrel — nothing else. So any relative import that leaves the
    // owning feature must target another feature's `domain/**` or exactly its
    // `service` barrel, the `shared/domain` kernel (from any layer), or
    // `shared/infrastructure`/`assets`/`types` (from an infrastructure file
    // only). Reaching into a sibling's `service/<file>` or `infrastructure/`, or
    // importing the package barrel `src/index`, is forbidden. A raw scan (not the
    // archunit graph) so re-export/default-import edge semantics can't hide a
    // deep import.
    describe("sibling isolation", () => {
        it("features import siblings only via domain or the service barrel", () => {
            const offenders = listSourceFiles()
                .filter((file) => FEATURE_ROOTS.includes(featureOf(file)))
                .flatMap((file) => {
                    const owningFeature = featureOf(file);
                    const fromInfrastructure =
                        file.includes("/infrastructure/");
                    return importedModules(readSource(file))
                        .map((specifier) => ({
                            specifier,
                            target: resolveSpecifier(file, specifier),
                        }))
                        .filter(
                            ({ target }) =>
                                target !== null &&
                                featureOf(target) !== owningFeature,
                        )
                        .filter(
                            ({ target }) =>
                                !isAllowedCrossFeatureTarget(
                                    target as string,
                                    fromInfrastructure,
                                ),
                        )
                        .map(({ specifier }) => `${file} → ${specifier}`);
                });
            expect(offenders).toEqual([]);
        });
    });

    // ─── G. Public surface freeze ────────────────────────────────────────────
    //
    // `src/index.ts` is the package barrel and the whole public API. It is frozen
    // to EgonClient plus the port/wire-format types (ADR 0010): EgonPlugin and
    // the former internal service exports are gone, and `additionalModules` is
    // the advanced-integration escape hatch. Widening the surface must be a
    // deliberate edit to the frozen lists here, never an accident.
    describe("public surface freeze", () => {
        // G1: the barrel imports exactly the frozen specifiers, and never an
        // infrastructure path (which would pull a didi default module into the
        // package entry and defeat EgonClient's lazy adapter loading).
        it("imports exactly the frozen specifiers with no infrastructure path", () => {
            const specifiers = [
                ...new Set(importedModules(readSource("src/index.ts"))),
            ].sort();
            expect(specifiers).toEqual([...FROZEN_INDEX_SPECIFIERS]);
            expect(
                specifiers.filter((specifier) =>
                    specifier.includes("infrastructure"),
                ),
            ).toEqual([]);
        });

        // G2: the runtime (value) exports are exactly EgonClient and the four
        // scope enums — every other export is a type, erased at build time.
        it("re-exports exactly the frozen runtime values", async () => {
            const module = await import("./index");
            const runtimeExports = Object.keys(module)
                .filter((name) => name !== "__esModule")
                .sort();
            expect(runtimeExports).toEqual([...FROZEN_INDEX_RUNTIME_EXPORTS]);
        });

        // G3: the package manifest exposes only the barrel, the stylesheet and
        // its own manifest, and ships only `dist` — so nothing bypasses index.ts.
        it("package.json exports and files stay locked to the barrel", () => {
            const packageJson = JSON.parse(readSource("package.json"));
            expect(Object.keys(packageJson.exports).sort()).toEqual([
                ".",
                "./package.json",
                "./style.css",
            ]);
            expect(packageJson.files).toEqual(["dist"]);
        });
    });

    // ─── H. No module-level mutable state ────────────────────────────────────
    //
    // Multi-instance safety (issue #12, CLAUDE.md): mutable state must live on
    // didi-instantiated classes so each EgonClient injector owns its own copy —
    // module scope is for pure functions and frozen config only. A shared
    // module-level binding cross-contaminates two clients on one page (e.g. one
    // custom-icon pool for both). Upstream WPS free-function state must be
    // converted into an injected service (see DomainStoryIdFactory). A raw
    // line scan, because the mutation is invisible to archunit's import graph;
    // only column-0 declarations count, since class members are indented.
    describe("no module-level mutable state", () => {
        it("declares no reassignable or stateful binding at module scope", () => {
            const offenders = listSourceFiles()
                .filter((file) => !MODULE_STATE_ALLOWLIST.includes(file))
                .flatMap((file) =>
                    readSource(file)
                        .split("\n")
                        .flatMap((line, index) =>
                            MODULE_STATE_PATTERNS.some((pattern) =>
                                pattern.test(line),
                            )
                                ? [`${file}:${index + 1} → ${line.trim()}`]
                                : [],
                        ),
                );
            expect(
                offenders,
                `module scope must hold only pure functions and frozen ` +
                    `config — move mutable state onto a didi-instantiated class`,
            ).toEqual([]);
        });
    });

    // ─── I. Rendering is read-only ───────────────────────────────────────────
    //
    // ADR 0016: drawing must not change the model. A repaint is not a user
    // action, runs an unbounded number of times, and for an imported story the
    // canvas *shares* the business objects with the file — so a write on the draw
    // path is silent, unbounded corruption of the persisted format (#65: an
    // activity's start point crept 5px per open; #74: five more writes). Every
    // mutation belongs to a command handler, an import repair, or the export
    // pass — somewhere undo can see it.
    //
    // A raw line scan, because archunit's graph sees imports, not assignments.
    // Deliberately syntactic and therefore conservative: it catches the shapes
    // the historical writes actually took, not every conceivable aliasing route.
    // It is a ratchet against regression, not a proof of purity — the real proof
    // is `RendererModelPurity.browser.spec.ts`, which repaints and diffs.
    describe("rendering is read-only", () => {
        it("no renderer file writes to a business object or an element", () => {
            const offenders = listSourceFiles()
                .filter(isRendererFile)
                .flatMap((file) => {
                    const lines = readSource(file).split("\n");
                    const writes = (text: string): boolean =>
                        RENDERER_WRITE_PATTERNS.some((pattern) =>
                            pattern.test(text),
                        );
                    return lines.flatMap((line, index) => {
                        const nextLine = lines[index + 1] ?? "";
                        const offence = `${file}:${index + 1} → ${line.trim()}`;
                        if (writes(line)) {
                            return [offence];
                        }
                        // Only now consider the line joined with the next, so a
                        // Prettier-wrapped statement is still seen — and skip it
                        // when the next line is the one that really offends, or
                        // every write would also be reported against its
                        // innocent predecessor.
                        return writes(`${line} ${nextLine}`) &&
                            !writes(nextLine)
                            ? [offence]
                            : [];
                    });
                });
            expect(
                offenders,
                `drawing is a read (ADR 0016) — move the write onto a command ` +
                    `handler, an import repair, or the export pass`,
            ).toEqual([]);
        });
    });
});

/**
 * Whether a cross-feature import `target` (already resolved to a `src/…` path)
 * is a legal reach into another feature or the shared kernel. Encodes rule F's
 * allowances: another feature's `domain/**` or exactly its `service` barrel are
 * open to anyone; the `shared/domain` kernel is open to any layer; and
 * `shared/infrastructure`/`assets`/`types` are open only to infrastructure
 * files. The package barrel `src/index` is never a legal internal target.
 */
function isAllowedCrossFeatureTarget(
    target: string,
    fromInfrastructure: boolean,
): boolean {
    if (target === "src/index") {
        return false;
    }
    if (/^src\/[^/]+\/domain\//.test(target)) {
        return true;
    }
    if (/^src\/[^/]+\/service$/.test(target)) {
        return true;
    }
    if (/^src\/shared\/domain\//.test(target)) {
        return true;
    }
    const isSharedInfraLeaf =
        /^src\/shared\/infrastructure\//.test(target) ||
        /^src\/assets\//.test(target) ||
        /^src\/types\//.test(target);
    return isSharedInfraLeaf && fromInfrastructure;
}
