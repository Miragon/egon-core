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
        ignores: ["**/dist", "**/node_modules", "**/coverage", "**/.yarn"],
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
        files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
        languageOptions: {
            globals: {
                require: "readonly",
                module: "readonly",
                __dirname: "readonly",
                Buffer: "readonly",
            },
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
);
