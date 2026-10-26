/// <reference types="vitest" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
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

/** Dependencies stay external so consumers dedupe diagram-js and friends. */
export default defineConfig({
    cacheDir: "node_modules/.vite",
    resolve: {
        // react-colorful is bundled; its React imports go to an adapter over
        // the exact Preact runtime diagram-js uses.
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
            // Vite names library CSS after the package; the `./style.css`
            // export needs this name.
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
    // Two tiers (ADR TST-1): `unit` is jsdom with mocked ports; `browser` is
    // chromium, the only tier where a real EgonClient boot renders (jsdom
    // cannot compute SVG getBBox).
    test: {
        globals: true,
        environment: "jsdom",
        server: {
            // Inlined so the React→Preact aliases above also apply in Vitest.
            deps: { inline: ["react-colorful"] },
        },
        coverage: {
            reportsDirectory: "coverage",
            // Counts untested production files too, not only loaded modules.
            include: ["src/**/*.ts", "src/**/*.tsx"],
            // Vitest's default exclude list is empty, so every non-production
            // path is named, including the re-export-only barrels (ADR TST-1).
            exclude: [
                "src/**/__tests__/**",
                "src/**/*.d.ts",
                "src/types/**",
                "src/icons.ts",
                "src/index.ts",
            ],
            // The coverage-report action reads json-summary and json, which the
            // v8 default omits.
            reporter: ["text", "json-summary", "json"],
            // Merged coverage of both projects, gated per layer at the measured
            // value rounded down. Thresholds only ratchet up (ADR TST-1).
            thresholds: {
                "src/**/domain/**": {
                    statements: 99,
                    branches: 98,
                    functions: 99,
                    lines: 99,
                },
                "src/*/service/**": {
                    statements: 97,
                    branches: 91,
                    functions: 99,
                    lines: 98,
                },
                "src/*/infrastructure/**": {
                    statements: 90,
                    branches: 81,
                    functions: 92,
                    lines: 91,
                },
                // Rewrites this file, so it is opt-in and never set in CI.
                autoUpdate:
                    process.env["COVERAGE_RATCHET"] === "1"
                        ? (threshold: number) => Math.floor(threshold)
                        : false,
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
