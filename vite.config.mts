/// <reference types="vitest" />
import { defineConfig } from "vite";
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
    test: {
        globals: true,
        environment: "jsdom",
        coverage: {
            reportsDirectory: "coverage",
        },
    },
});
