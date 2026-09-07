import { defineConfig, type Plugin } from "vite";

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
    server: {
        host: "127.0.0.1",
        strictPort: true,
    },
});
