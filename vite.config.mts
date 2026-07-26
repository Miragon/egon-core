/// <reference types="vitest" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Standalone Vite build for the egon-core library.
 *
 * Emits two rollup entries — the ESM library (`index`) and the compiled
 * stylesheet (`style`) — plus a mirrored `.d.ts` tree via vite-plugin-dts.
 * External deps are left unbundled so consumers dedupe diagram-js & friends.
 */
export default defineConfig({
    cacheDir: "node_modules/.vite",
    plugins: [
        tsconfigPaths(),
        dts({
            entryRoot: "src",
            outDirs: ["dist"],
            include: ["src"],
            tsconfigPath: "./tsconfig.lib.json",
            copyDtsFiles: true,
        }),
    ],
    css: {
        preprocessorOptions: {
            // Vite 7 uses Sass's modern compiler API by default; the explicit
            // `api` option was removed, so no scss options are needed here.
            scss: {},
        },
    },
    build: {
        outDir: "dist",
        lib: {
            entry: {
                index: "src/index.ts",
                style: "src/styles.scss",
            },
            formats: ["es"],
            // Vite 7 names library CSS after the package by default; pin it back
            // to `style.css` to preserve the published `./style.css` export.
            cssFileName: "style",
        },
        rollupOptions: {
            input: {
                index: "src/index.ts",
                style: "src/styles.scss",
            },
            external: (id: string) =>
                [
                    "diagram-js",
                    "diagram-js-direct-editing",
                    "didi",
                    "ids",
                    "min-dash",
                    "min-dom",
                    "tiny-svg",
                ].some((dep) => id === dep || id.startsWith(`${dep}/`)),
            output: {
                entryFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
    },
    // Two tiers, split by vitest projects (ADR 0013). Root options are shared
    // via `extends: true`; each project narrows environment and file set.
    // - `unit`: fast jsdom suite; the default `yarn test`/coverage loop. Ports
    //   and diagram-js are mocked here.
    // - `browser`: real chromium via playwright, the only tier where a genuine
    //   EgonClient boot renders (jsdom can't compute SVG getBBox).
    test: {
        globals: true,
        environment: "jsdom",
        coverage: {
            reportsDirectory: "coverage",
            // json-summary + json feed the PR coverage-report action; the v8
            // default omits them, so name the reporters explicitly.
            reporter: ["text", "json-summary", "json"],
            // Coverage runs unit-only, so gate just the framework-free domain
            // model — the layer that must stay well-tested. Ratchet upward as
            // coverage improves; never lower to make a red build pass.
            thresholds: {
                "src/**/domain/**": {
                    statements: 80,
                    branches: 98,
                    functions: 80,
                    lines: 80,
                },
            },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    // `exclude` replaces vitest's defaults, so re-add them
                    // before subtracting the browser specs.
                    exclude: [
                        ...configDefaults.exclude,
                        "**/*.browser.spec.ts",
                    ],
                },
            },
            {
                extends: true,
                test: {
                    name: "browser",
                    include: ["src/**/*.browser.spec.ts"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: "playwright",
                        instances: [{ browser: "chromium" }],
                    },
                },
            },
        ],
    },
});
