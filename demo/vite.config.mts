import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

const publicEntry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const publicStyles = fileURLToPath(
    new URL("../src/styles.scss", import.meta.url),
);
const reactColorfulCompat = fileURLToPath(
    new URL(
        "../src/modeler/infrastructure/color-picker/ReactColorfulCompat.ts",
        import.meta.url,
    ),
);

function announcePortlessUrl(): Plugin {
    return {
        name: "announce-portless-url",
        configureServer(server) {
            server.httpServer?.once("listening", () => {
                const url = process.env.PORTLESS_URL;
                if (!url) {
                    console.error(
                        "The demo must be started through portless (PORTLESS_URL is missing).",
                    );
                    return;
                }
                console.log(`EGON_DEMO_READY ${url}`);
            });
        },
    };
}

export default defineConfig({
    root: "demo",
    cacheDir: "../node_modules/.vite/demo",
    plugins: [announcePortlessUrl()],
    resolve: {
        // Exact public-specifier aliases keep the development demo on source
        // without allowing arbitrary egon-core subpaths (ADR 0028).
        alias: [
            { find: /^egon-core\/style\.css$/, replacement: publicStyles },
            { find: /^egon-core$/, replacement: publicEntry },
            {
                find: "react-dom/test-utils",
                replacement: "preact/test-utils",
            },
            { find: "react-dom/client", replacement: "preact/compat" },
            { find: "react-dom", replacement: "preact/compat" },
            { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
            { find: "react", replacement: reactColorfulCompat },
        ],
    },
    server: {
        host: "127.0.0.1",
        strictPort: true,
    },
});
