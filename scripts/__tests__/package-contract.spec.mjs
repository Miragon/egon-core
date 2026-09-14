import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    EXPECTED_PACKAGE_CONTRACT,
    inspectPackageContract,
} from "../package-contract.mjs";

const temporaryRoots = [];

afterEach(async () => {
    await Promise.all(
        temporaryRoots
            .splice(0)
            .map((root) => rm(root, { recursive: true, force: true })),
    );
});

describe("installed package contract", () => {
    it("accepts package identity, license, exports, and every emitted dist file", async () => {
        const fixture = await packageFixture();

        const result = await inspectPackageContract(fixture.options);

        expect(result.emittedFiles).toEqual([
            "chunk.js",
            "index.d.ts",
            "index.js",
            "style.css",
        ]);
    });

    it("rejects malformed package metadata", async () => {
        const fixture = await packageFixture({ name: "wrong-package" });

        await expect(inspectPackageContract(fixture.options)).rejects.toThrow(
            'Installed package name must be "egon-core"',
        );
    });

    it("rejects a package missing any emitted dist file", async () => {
        const fixture = await packageFixture();
        await rm(join(fixture.installedPackageRoot, "dist", "chunk.js"));

        await expect(inspectPackageContract(fixture.options)).rejects.toThrow(
            "missing emitted dist file: chunk.js",
        );
    });
});

async function packageFixture(overrides = {}) {
    const root = await mkdtemp(join(tmpdir(), "egon-core-contract-test-"));
    temporaryRoots.push(root);
    const sourceDistRoot = join(root, "source-dist");
    const installedPackageRoot = join(root, "installed");
    const installedDistRoot = join(installedPackageRoot, "dist");
    await Promise.all([
        mkdir(sourceDistRoot, { recursive: true }),
        mkdir(installedDistRoot, { recursive: true }),
    ]);
    for (const [file, contents] of Object.entries({
        "index.js": "export {};",
        "index.d.ts": "export {};",
        "style.css": ".editor {}",
        "chunk.js": "export const chunk = true;",
    })) {
        await writeFile(join(sourceDistRoot, file), contents);
        await cp(join(sourceDistRoot, file), join(installedDistRoot, file));
    }

    const sourceLicensePath = join(root, "source-LICENSE");
    await writeFile(sourceLicensePath, "GPL test license\n");
    await cp(sourceLicensePath, join(installedPackageRoot, "LICENSE"));
    const manifest = {
        ...EXPECTED_PACKAGE_CONTRACT,
        version: "0.1.0",
        ...overrides,
    };
    await writeFile(
        join(installedPackageRoot, "package.json"),
        `${JSON.stringify(manifest)}\n`,
    );

    return {
        installedPackageRoot,
        options: {
            installedPackageRoot,
            sourceDistRoot,
            expectedVersion: "0.1.0",
            sourceLicensePath,
        },
    };
}
