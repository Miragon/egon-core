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
            // ADR 0028: the demo is a consumer harness. It uses only the two
            // package exports a real host needs, even though Vite resolves
            // those exact specifiers to source during local development.
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            regex: "^(?:\\.\\./)+src/",
                            message:
                                "Demo code must import library code, types, and styles through egon-core package exports.",
                        },
                        {
                            regex: "^(?:bpmn-font|diagram-js|diagram-js-minimap)(?:/|$)",
                            message:
                                "Demo code must obtain dependency editor styles from egon-core/style.css.",
                        },
                        {
                            regex: "^egon-core/(?!style\\.css$)",
                            message:
                                "Demo code may import only egon-core and egon-core/style.css.",
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
