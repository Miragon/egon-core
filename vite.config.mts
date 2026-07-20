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
            outDir: "dist",
            include: ["src"],
            tsconfigPath: "./tsconfig.lib.json",
            copyDtsFiles: true,
        }),
    ],
    css: {
        preprocessorOptions: {
            scss: {
                api: "modern-compiler",
            },
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
