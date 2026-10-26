import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractGraph, projectFiles } from "archunit";
import ts from "typescript";

/**
 * Executable layout rules (ADRs ARC-1 to ARC-5, API-1). They are regression
 * locks: fix the code, never relax a rule. archunit's graph covers internal
 * imports; raw-source scans cover what it drops under this tsconfig, namely
 * package imports and dynamic `import()`.
 */
// Vitest injects __dirname even though this file is ESM.
const REPO_ROOT = resolve(__dirname, "..");
const TSCONFIG = resolve(REPO_ROOT, "tsconfig.lib.json");

type Edge = Awaited<ReturnType<typeof extractGraph>>[number];

/**
 * Each pattern needs its keyword next to a quoted specifier, so prose in
 * comments doesn't match. A commented-out import still does: nothing strips
 * comments.
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

/** Non-test `.ts`/`.tsx` files under `src/`, as repo-relative POSIX paths. */
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

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "coverage"]);

/** Repo-relative paths under `roots` whose file name matches, tests included. */
function listFilesUnder(roots: readonly string[], fileName: RegExp): string[] {
    const files: string[] = [];
    const walk = (repoRelativeDir: string): void => {
        for (const entry of readdirSync(resolve(REPO_ROOT, repoRelativeDir))) {
            const repoRelativePath = `${repoRelativeDir}/${entry}`;
            if (statSync(resolve(REPO_ROOT, repoRelativePath)).isDirectory()) {
                if (!SKIPPED_DIRECTORIES.has(entry)) {
                    walk(repoRelativePath);
                }
            } else if (fileName.test(entry)) {
                files.push(repoRelativePath);
            }
        }
    };
    roots.forEach(walk);
    return files;
}

function listCommentScanFiles(): string[] {
    return [
        "eslint.config.mjs",
        "playwright.config.ts",
        "vite.config.mts",
        ...listFilesUnder(["src", "demo", "scripts"], /\.(tsx?|mts|mjs)$/),
    ];
}

/** `CHANGELOG.md` is exempt: Release Please writes its PR links. */
function listDocumentationFiles(): string[] {
    return [
        "AGENTS.md",
        "README.md",
        "SYNC.md",
        ...listFilesUnder([".agents", ".github", "docs", "src"], /\.md$/),
    ];
}

interface SourceComment {
    readonly line: number;
    readonly text: string;
}

/**
 * Parsed rather than matched by regex, so `//` inside a string or a colour
 * literal in code is never mistaken for a comment.
 */
function commentsIn(repoRelativePath: string): SourceComment[] {
    const content = readSource(repoRelativePath);
    const sourceFile = ts.createSourceFile(
        repoRelativePath,
        content,
        ts.ScriptTarget.Latest,
        true,
    );
    const commentsByStart = new Map<number, SourceComment>();
    const collect = (ranges: readonly ts.CommentRange[] | undefined): void => {
        for (const range of ranges ?? []) {
            commentsByStart.set(range.pos, {
                line:
                    sourceFile.getLineAndCharacterOfPosition(range.pos).line +
                    1,
                text: content.slice(range.pos, range.end),
            });
        }
    };
    const visit = (node: ts.Node): void => {
        collect(ts.getLeadingCommentRanges(content, node.pos));
        collect(ts.getTrailingCommentRanges(content, node.end));
        node.getChildren(sourceFile).forEach(visit);
    };
    visit(sourceFile);
    return [...commentsByStart.values()];
}

function readSource(repoRelativePath: string): string {
    return readFileSync(resolve(REPO_ROOT, repoRelativePath), "utf8");
}

function isDomainFile(repoRelativePath: string): boolean {
    return repoRelativePath.includes("/domain/");
}

function isServiceFile(repoRelativePath: string): boolean {
    return /^src\/[^/]+\/service\//.test(repoRelativePath);
}

function featureOf(repoRelativePath: string): string {
    return repoRelativePath.split("/")[1] ?? "";
}

/**
 * Strips a trailing `/index` so both barrel spellings compare equal. Package
 * specifiers return `null`: rules C and D cover them, not the boundary scans.
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

/** Composition roots: the only service files that may wire adapters. */
const COMPOSITION_ROOT_ALLOWLIST: readonly string[] = [
    "src/modeler/service/EgonClient.ts", // dynamic import() of the diagram-js adapters
    "src/iconSet/service/index.ts", // wires IconCssInjector (IconStyleSheetPort)
    "src/story/service/importModule.ts", // wires VersionBoxBanner (VersionBannerPort)
];

/** Origins for rule F. `src/index.ts`, `types` and `assets` are not origins. */
const FEATURE_ROOTS: readonly string[] = [
    "modeler",
    "story",
    "iconSet",
    "labelDictionary",
    "shared",
];

/** Rules G1, G2. Changing the public API means editing these and ADR API-1. */
const FROZEN_INDEX_SPECIFIERS: readonly string[] = [
    "./iconSet/domain/IconTypes",
    "./labelDictionary/domain/LabelDictionary",
    "./modeler/domain/export/VisualExport",
    "./modeler/domain/model/TextRendererConfig",
    "./modeler/domain/model/Viewport",
    "./modeler/domain/ports/IconPort",
    "./modeler/domain/ports/ModelerPort",
    "./modeler/service/ColorPickerProvider",
    "./modeler/service/EgonClient",
    "./modeler/service/EgonClientConfig",
    "./story/domain/DomainStoryDocument",
    "./story/domain/iconSet",
    "./story/domain/replay",
    "./story/domain/scope",
];

const FROZEN_INDEX_RUNTIME_EXPORTS: readonly string[] = [
    "DomainPurity",
    "EgonClient",
    "Granularity_Goal",
    "Granularity_Grain",
    "PointInTime",
];

/** The deliberately narrow, data-only secondary entry (ADRs API-1, ICO-5). */
const FROZEN_ICONS_SPECIFIERS: readonly string[] = [
    "./iconSet/domain/defaultIcons",
];

const FROZEN_ICONS_RUNTIME_EXPORTS: readonly string[] = ["defaultIcons"];

/**
 * Anchored at column 0 because class members are indented. Non-empty literal
 * config and `export const` arrow functions deliberately don't match.
 */
const MODULE_STATE_PATTERNS: readonly RegExp[] = [
    /^(?:export\s+)?(?:let|var)\s/, // reassignable binding
    /^(?:export\s+)?const\s+[\w$]+(?:\s*:[^=]+)?\s*=\s*new\s/, // stateful instance
    /^(?:export\s+)?const\s+[\w$]+(?:\s*:[^=]+)?\s*=\s*\[\s*\]/, // empty-array accumulator
];

/** Empty by design: any entry is a reviewed exception to rule H. */
const MODULE_STATE_ALLOWLIST: readonly string[] = [];

/**
 * A frozen baseline, not an endorsement: ADR ARC-3 requires it to shrink as
 * policy leaves adapters, and forbids new entries.
 */
const INFRASTRUCTURE_PREDICATE_IMPORT_ALLOWLIST: readonly string[] = [
    "src/modeler/infrastructure/context-pad/DomainStoryContextPadProvider.ts",
    "src/modeler/infrastructure/copy-paste/DomainStoryPasteRestore.ts",
    "src/modeler/infrastructure/labeling/DomainStoryLabelEditingPreview.ts",
    "src/modeler/infrastructure/labeling/DomainStoryLabelEditingProvider.ts",
    "src/modeler/infrastructure/popup/DomainStoryActivityNumbering.ts",
    "src/modeler/infrastructure/popup/DomainStoryPopupService.ts",
    "src/modeler/infrastructure/renderer/DomainStoryRenderer.ts",
    "src/modeler/infrastructure/replace/DomainStoryReplaceMenuProvider.ts",
    "src/modeler/infrastructure/rules/DomainStoryRules.ts",
    "src/modeler/infrastructure/update-handler/handler/activityUpdateHandler.ts",
    "src/modeler/infrastructure/update-handler/handler/elementUpdateHandler.ts",
    "src/modeler/infrastructure/updater/DomainStoryUpdater.ts",
];

/**
 * Rule I write shapes:
 * 1. An assignment through `businessObject`/`semantic`.
 * 2. `assign(` whose first argument is not a literal: min-dash mutates it.
 *    The `\s*` sits inside the lookaheads: before them, the engine backtracks
 *    off the spaces and every call matches. `(?!\s*$)` leaves a
 *    Prettier-wrapped `assign(` to the joined-line check in rule I.
 */
const RENDERER_WRITE_PATTERNS: readonly RegExp[] = [
    /\b(?:businessObject|semantic)(?:\.\w+|\[[^\]]*\])+\s*(?:\+|-|\*|\/|\?\?|\|\||&&)?=(?!=)/,
    /\bassign\((?!\s*[{[])(?!\s*$)/,
];

/** Matches `renderer/` folders but not `text-renderer/`. */
function isRendererFile(repoRelativePath: string): boolean {
    return /(^|\/)renderer\//.test(repoRelativePath);
}

function infrastructurePredicateImporters(): string[] {
    const predicateModule = "src/story/domain/elementPredicates";
    return listSourceFiles()
        .filter((file) => file.includes("/infrastructure/"))
        .filter((file) =>
            importedModules(readSource(file)).some(
                (specifier) =>
                    resolveSpecifier(file, specifier) === predicateModule,
            ),
        )
        .sort();
}

describe("architecture", () => {
    let edges: Edge[] = [];

    // archunit caches the graph per tsconfig; building it here gives the cold
    // build a long timeout instead of the per-test default.
    beforeAll(async () => {
        edges = await extractGraph(TSCONFIG);
    }, 60_000);

    // ─── A. Graph sanity (ADR ARC-2) ────────────────────────────────────────
    // A failing resolver yields an edge-less graph, and every graph rule below
    // would then pass vacuously.
    describe("graph sanity", () => {
        it("resolves cross-file dependencies", () => {
            const crossFileEdges = edges.filter(
                (edge) => !edge.external && edge.source !== edge.target,
            );
            expect(crossFileEdges.length).toBeGreaterThan(0);
        });
    });

    // ─── B. No import cycles (ADR ARC-1) ────────────────────────────────────
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

    // ─── C. Domain purity (ADR ARC-1) ───────────────────────────────────────
    // Framework access goes through ports in `domain/`, implemented outside.
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

    // ─── D. Modeler service is framework-free (ADR ARC-1) ───────────────────
    // Only modeler: story and labelDictionary services are diagram-js services
    // by nature; modeler's is the pure use-case surface behind EgonClient.
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

    // ─── E. Generalized hexagon (ADR ARC-1) ─────────────────────────────────
    // Services reach the outside only through `domain/ports`; only composition
    // roots wire the adapters.
    describe("generalized hexagon", () => {
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

        // Raw scan: a dynamic `import()` produces no graph edge, so it would
        // slip past the graph rule above.
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

    // ─── F. Sibling isolation (ADR ARC-1) ───────────────────────────────────
    // A feature's public surface is its `domain/**` plus its `service` barrel.
    // A raw scan, so archunit's re-export edges can't hide a deep import.
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

    // ─── G. Public surface freeze (ADRs API-1, ICO-5) ───────────────────────
    // Widening `src/index.ts` or `src/icons.ts` must be a deliberate edit to
    // the frozen lists.
    describe("public surface freeze", () => {
        // G1: an infrastructure path would pull a didi module into the package
        // entry and defeat EgonClient's lazy adapter loading.
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

        // G2: every other export is a type, erased at build time.
        it("re-exports exactly the frozen runtime values", async () => {
            const module = await import("./index");
            const runtimeExports = Object.keys(module)
                .filter((name) => name !== "__esModule")
                .sort();
            expect(runtimeExports).toEqual([...FROZEN_INDEX_RUNTIME_EXPORTS]);
        });

        it("keeps the icons entry data-only and exactly frozen", async () => {
            const specifiers = [
                ...new Set(importedModules(readSource("src/icons.ts"))),
            ].sort();
            expect(specifiers).toEqual([...FROZEN_ICONS_SPECIFIERS]);
            expect(
                specifiers.filter(
                    (specifier) =>
                        specifier.endsWith(".css") ||
                        specifier.endsWith(".scss") ||
                        !specifier.startsWith("."),
                ),
            ).toEqual([]);

            const module = await import("./icons");
            const runtimeExports = Object.keys(module)
                .filter((name) => name !== "__esModule")
                .sort();
            expect(runtimeExports).toEqual([...FROZEN_ICONS_RUNTIME_EXPORTS]);

            const iconFiles = [
                "src/icons.ts",
                "src/iconSet/domain/defaultIcons.ts",
            ];
            const forbiddenRuntimeReferences = iconFiles.flatMap((file) => {
                const content = readSource(file);
                return [
                    ...importedModules(content)
                        .filter(
                            (specifier) =>
                                !specifier.startsWith(".") ||
                                /\.(?:css|scss)$/.test(specifier),
                        )
                        .map((specifier) => `${file} → ${specifier}`),
                    ...(/\b(?:document|window|customElements|HTMLElement|SVGElement)\b/.test(
                        content,
                    )
                        ? [`${file} → DOM global/type`]
                        : []),
                ];
            });
            expect(forbiddenRuntimeReferences).toEqual([]);
        });

        it("the main entry cannot reach the optional icon pack", () => {
            const reachable = new Set(["src/index.ts"]);
            let changed = true;
            while (changed) {
                changed = false;
                for (const edge of edges) {
                    if (
                        edge.external ||
                        !reachable.has(edge.source) ||
                        reachable.has(edge.target)
                    ) {
                        continue;
                    }
                    reachable.add(edge.target);
                    changed = true;
                }
            }

            expect(
                [...reachable].filter((file) =>
                    file.endsWith("/defaultIcons.ts"),
                ),
            ).toEqual([]);
        });

        it("package.json exports and files stay locked to public entries", () => {
            const packageJson = JSON.parse(readSource("package.json"));
            expect(Object.keys(packageJson.exports).sort()).toEqual([
                ".",
                "./icons",
                "./package.json",
                "./style.css",
            ]);
            expect(packageJson.files).toEqual(["dist"]);
        });
    });

    // ─── H. No module-level mutable state (ADR ARC-5) ───────────────────────
    // Module state would be shared by every EgonClient on a page. A raw line
    // scan, because archunit's graph cannot see state.
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

    // ─── I. Rendering is read-only (ADR ARC-4) ──────────────────────────────
    // Repaints run unboundedly and share business objects with the file, so a
    // draw-path write silently corrupts saved stories. A raw line scan, because
    // archunit sees imports, not assignments. Syntactic, so an alias slips
    // past: `RendererModelPurity.browser.spec.ts` is the real proof.
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
                        // Join with the next line to catch Prettier-wrapped
                        // writes, unless the next line offends on its own and
                        // would be reported twice.
                        return writes(`${line} ${nextLine}`) &&
                            !writes(nextLine)
                            ? [offence]
                            : [];
                    });
                });
            expect(
                offenders,
                `drawing is a read (ADR ARC-4) — move the write onto a command ` +
                    `handler, an import repair, or the export pass`,
            ).toEqual([]);
        });
    });

    // ─── J. Infrastructure predicate-import ratchet (ADR ARC-3) ─────────────
    // A predicate import marks an adapter that may make notation decisions.
    // Two tests, so a new importer and a stale entry fail separately.
    describe("infrastructure predicate-import ratchet", () => {
        it("rejects infrastructure importers outside the frozen allowlist", () => {
            const importers = infrastructurePredicateImporters();
            const unlisted = importers.filter(
                (file) =>
                    !INFRASTRUCTURE_PREDICATE_IMPORT_ALLOWLIST.includes(file),
            );

            expect(
                unlisted,
                `infrastructure must not add direct elementPredicates imports ` +
                    `(ADR ARC-3); move notation decisions into domain code`,
            ).toEqual([]);
        });

        it("requires stale allowlist entries to be removed", () => {
            const importers = infrastructurePredicateImporters();
            const stale = INFRASTRUCTURE_PREDICATE_IMPORT_ALLOWLIST.filter(
                (file) => !importers.includes(file),
            );

            expect(
                stale,
                `the predicate-import allowlist may only shrink through review; ` +
                    `remove entries whose direct dependency disappeared`,
            ).toEqual([]);
        });
    });

    // ─── K. Comments carry no issue or PR references (ADR ENG-5) ────────────
    // `#` plus up to five digits, so six-digit colours and `&#…;` entities pass.
    describe("comments carry no issue or PR references", () => {
        const ticketReference =
            /(?<!&)#\d{1,5}\b|github\.com\/[^\s/]+\/[^\s/]+\/(?:issues|pull)\//;

        it("no code comment cites an issue or pull request", () => {
            const offenders = listCommentScanFiles().flatMap((file) =>
                commentsIn(file)
                    .filter((comment) => ticketReference.test(comment.text))
                    .map((comment) => `${file}:${comment.line}`),
            );
            expect(
                offenders,
                `comments explain why, not which ticket; git history links ` +
                    `the PR (ADR ENG-5)`,
            ).toEqual([]);
        });

        it("no documentation file cites an issue or pull request", () => {
            const offenders = listDocumentationFiles().flatMap((file) =>
                readSource(file)
                    .split("\n")
                    .flatMap((line, index) =>
                        ticketReference.test(line)
                            ? [`${file}:${index + 1}`]
                            : [],
                    ),
            );
            expect(
                offenders,
                `state the substance instead of the ticket (ADR ENG-5)`,
            ).toEqual([]);
        });
    });
});

/** Rule F targets. Shared infrastructure leaves are for infrastructure only. */
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
