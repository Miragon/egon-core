import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

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
            // ADRs TST-3 and API-1: the demo is a consumer harness, so it uses
            // only the package exports a real host has, even though Vite
            // resolves them to source in development.
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
                            regex: "^egon-core/(?!icons$|style\\.css$)",
                            message:
                                "Demo code may import only egon-core, egon-core/icons, and egon-core/style.css.",
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
