import {
    test as base,
    expect,
    type Request,
    type Response,
} from "@playwright/test";

const assetTypes = new Set(["font", "image", "stylesheet"]);

export const test = base.extend<{ assetFailures: string[] }>({
    // Playwright requires fixture dependencies to use an object pattern.
    // eslint-disable-next-line no-empty-pattern
    baseURL: async ({}, use) => {
        const portlessUrl = process.env["PORTLESS_URL"];
        if (!portlessUrl) {
            throw new Error(
                "PORTLESS_URL was not captured from the demo readiness marker.",
            );
        }
        await use(portlessUrl);
    },
    assetFailures: [
        async ({ page }, use) => {
            const failures: string[] = [];
            const recordFailedRequest = (request: Request) => {
                if (assetTypes.has(request.resourceType())) {
                    failures.push(
                        `${request.resourceType()} ${request.url()}: ${request.failure()?.errorText ?? "request failed"}`,
                    );
                }
            };
            const recordFailedResponse = (response: Response) => {
                const request = response.request();
                if (
                    assetTypes.has(request.resourceType()) &&
                    response.status() >= 400
                ) {
                    failures.push(
                        `${request.resourceType()} ${response.url()}: HTTP ${response.status()}`,
                    );
                }
            };

            page.on("requestfailed", recordFailedRequest);
            page.on("response", recordFailedResponse);
            await use(failures);
            expect(
                failures,
                "editor assets should load without errors",
            ).toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };
