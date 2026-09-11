import { defineConfig, devices } from "@playwright/test";

const externalServer = process.env["EGON_E2E_EXTERNAL_SERVER"] === "1";
const htmlOutput = process.env["EGON_PLAYWRIGHT_HTML_DIR"];

export default defineConfig({
    testDir: "./demo/__tests__",
    fullyParallel: false,
    workers: 1,
    retries: process.env["CI"] ? 1 : 0,
    outputDir: process.env["EGON_PLAYWRIGHT_OUTPUT_DIR"] ?? "test-results",
    reporter:
        process.env["CI"] || htmlOutput
            ? [
                  ["line"],
                  [
                      "html",
                      {
                          open: "never",
                          ...(htmlOutput ? { outputFolder: htmlOutput } : {}),
                      },
                  ],
              ]
            : "list",
    use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
    webServer: externalServer
        ? undefined
        : {
              command: "yarn demo:e2e",
              wait: {
                  stdout: /EGON_DEMO_READY (?<portless_url>http:\/\/[^\s]+)/,
              },
              stdout: "pipe",
              timeout: 120_000,
              reuseExistingServer: false,
              gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
          },
});
