/// <reference types="vitest" />
import { defineConfig } from "vite";
import { configDefaults, coverageConfigDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

const reactColorfulCompat = fileURLToPath(
    new URL(
        "./src/modeler/infrastructure/color-picker/ReactColorfulCompat.ts",
        import.meta.url,
    ),
);

/**
 * Standalone Vite build for the egon-core library.
 *
 * Emits three rollup entries — the ESM library (`index`), optional icon data
 * (`icons`) and the compiled stylesheet (`style`) — plus a mirrored `.d.ts`
 * tree via vite-plugin-dts.
 * External deps are left unbundled so consumers dedupe diagram-js & friends.
 */
export default defineConfig({
    cacheDir: "node_modules/.vite",
    resolve: {
        // react-colorful is bundled, but its React imports target the
        // React-compatible adapter backed by diagram-js's exact Preact runtime.
        // The remaining aliases follow Preact's documented integration and
        // apply equally to builds and Vitest.
        alias: [
            { find: "react-dom/test-utils", replacement: "preact/test-utils" },
            { find: "react-dom/client", replacement: "preact/compat" },
            { find: "react-dom", replacement: "preact/compat" },
            { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
            { find: "react", replacement: reactColorfulCompat },
        ],
    },
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
            // Vite uses Sass's modern compiler API by default; the explicit
            // `api` option was removed, so no scss options are needed here.
            scss: {},
        },
    },
    build: {
        outDir: "dist",
        // Vite 8 requires CSS splitting for a standalone stylesheet entry.
        cssCodeSplit: true,
        lib: {
            entry: {
                index: "src/index.ts",
                icons: "src/icons.ts",
                style: "src/styles.scss",
            },
            formats: ["es"],
            // Vite names library CSS after the package by default; pin it back
            // to `style.css` to preserve the published `./style.css` export.
            cssFileName: "style",
        },
        rollupOptions: {
            input: {
                index: "src/index.ts",
                icons: "src/icons.ts",
                style: "src/styles.scss",
            },
            external: (id: string) =>
                [
                    "diagram-js",
                    "diagram-js-direct-editing",
                    "didi",
                    "dompurify",
                    "ids",
                    "min-dash",
                    "min-dom",
                    "preact",
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
        server: {
            // Transform this dev-only source dependency so the React→Preact
            // aliases above apply during Vitest just as they do in the build.
            deps: { inline: ["react-colorful"] },
        },
        coverage: {
            reportsDirectory: "coverage",
            // Include untested production files as well as loaded modules (Vitest 4).
            include: ["src/**/*.ts", "src/**/*.tsx"],
            // The public-consumer harness has its own Playwright verification. Do
            // not count unrelated demo/config/launcher files as uncovered in
            // the unit-only report (ADR 0028).
            exclude: [
                ...coverageConfigDefaults.exclude,
                "demo/**",
                "scripts/**",
                "playwright.config.ts",
            ],
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
                        // Playwright owns the public-consumer journeys.
                        "demo/__tests__/**",
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
                        provider: playwright(),
                        instances: [{ browser: "chromium" }],
                    },
                },
            },
        ],
    },
});
