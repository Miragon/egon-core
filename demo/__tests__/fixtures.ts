import { test as base, expect } from "@playwright/test";

export const test = base.extend({
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
});

export { expect };
