import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Standalone flat ESLint config.
 *
 * Flattens the fork's base + lib configs into one: recommended JS/TS rules,
 * Prettier compatibility (disables stylistic rules that conflict with the
 * formatter), a small set of project rule relaxations, and a Node-globals block
 * for CommonJS-style config/tooling files.
 */
export default tseslint.config(
    {
        ignores: [
            "**/dist",
            "**/node_modules",
            "**/coverage",
            "**/.yarn",
            "**/playwright-report",
            "**/test-results",
            "**/blob-report",
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
        rules: {
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "warn",
        },
    },
    {
        files: ["demo/**/*.ts", "demo/**/*.mts"],
        rules: {
            // ADR 0021: the demo is a consumer harness, so every import into
            // library source must cross the public barrel.
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            regex: "^(?:\\.\\./)+src/(?!index\\.ts$|styles\\.scss$)",
                            message:
                                "Demo code must import library code and types only from src/index.ts.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
        languageOptions: {
            globals: {
                require: "readonly",
                module: "readonly",
                __dirname: "readonly",
                Buffer: "readonly",
                console: "readonly",
                process: "readonly",
            },
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
);
