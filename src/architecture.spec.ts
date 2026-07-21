import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractGraph, projectFiles } from "archunit";

/**
 * Executable architecture tests — the enforcement half of
 * docs/adr/0005-module-layout-and-architecture-tests.md. They turn the layout
 * rules (framework-free domain layers, ports between rings, one sanctioned
 * composition root) into CI gates so regressions break the build instead of
 * rotting silently. All rules are regression locks that must stay green; do
 * not relax a rule to make CI pass — that defeats the gate.
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

/** All non-test `.ts` files under `src/`, as repo-relative POSIX paths. */
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
                entry.endsWith(".ts") &&
                !/\.(spec|test)\.ts$/.test(entry)
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
 * Every `domain/` layer is innermost, wherever it lives: the shared plugin
 * domain (`src/domain/…`) as well as the per-context domain folders
 * (`src/client/domain/…`, `src/label-dictionary/domain/…`).
 */
function isDomainFile(repoRelativePath: string): boolean {
    return repoRelativePath.includes("/domain/");
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

    // ─── D. Client hexagon ───────────────────────────────────────────────────
    //
    // `src/client` is a ports-and-adapters context: `application` talks to the
    // outside world only through its `ports`, and `infrastructure` implements
    // them. `EgonClient` doubles as the composition root (ADR 0005) — it alone
    // may reference `infrastructure`, and only via dynamic `import()` so the
    // static layering stays intact.
    describe("client hexagon", () => {
        it("application does not statically depend on infrastructure", async () => {
            const violations = await projectFiles(TSCONFIG)
                .inFolder("src/client/application/**")
                .shouldNot()
                .dependOnFiles()
                .inFolder("src/client/infrastructure/**")
                .check();
            expect(violations).toEqual([]);
        });

        // The graph rule above cannot see dynamic imports, so a second
        // application file adopting the composition root's `import()` trick
        // would slip through it — this text scan closes that hole.
        it("only the EgonClient composition root references infrastructure", () => {
            const offenders = listSourceFiles()
                .filter(
                    (file) =>
                        file.startsWith("src/client/application/") &&
                        !file.endsWith("/EgonClient.ts"),
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

        it("application imports no framework module except didi types in the composition root", () => {
            const offenders = listSourceFiles()
                .filter((file) => file.startsWith("src/client/application/"))
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
});
