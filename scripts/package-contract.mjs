import { access, lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const EXPECTED_PACKAGE_CONTRACT = Object.freeze({
    name: "egon-core",
    license: "GPL-3.0-or-later",
    main: "./dist/index.js",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    style: "./dist/style.css",
    exports: {
        ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
        },
        "./style.css": "./dist/style.css",
        "./package.json": "./package.json",
    },
});

export async function inspectPackageContract({
    installedPackageRoot,
    sourceDistRoot,
    expectedVersion,
    sourceLicensePath,
}) {
    const manifestPath = join(installedPackageRoot, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    for (const field of [
        "name",
        "license",
        "main",
        "module",
        "types",
        "style",
    ]) {
        const expected =
            field === "name"
                ? EXPECTED_PACKAGE_CONTRACT.name
                : field === "license"
                  ? EXPECTED_PACKAGE_CONTRACT.license
                  : EXPECTED_PACKAGE_CONTRACT[field];
        if (manifest[field] !== expected) {
            throw new Error(
                `Installed package ${field} must be ${JSON.stringify(expected)} (received ${JSON.stringify(manifest[field])}).`,
            );
        }
    }

    if (manifest.version !== expectedVersion) {
        throw new Error(
            `Installed package version ${manifest.version} does not match source version ${expectedVersion}.`,
        );
    }
    if (!isStableSemver(manifest.version)) {
        throw new Error(
            `Installed package version is not a stable semantic version: ${manifest.version}.`,
        );
    }
    if (
        JSON.stringify(manifest.exports) !==
        JSON.stringify(EXPECTED_PACKAGE_CONTRACT.exports)
    ) {
        throw new Error(
            "Installed package exports do not match the public contract.",
        );
    }

    for (const target of exportTargets(manifest)) {
        if (!target.startsWith("./")) {
            throw new Error(
                `Package export target is not relative: ${target}.`,
            );
        }
        await access(join(installedPackageRoot, target));
    }

    const installedLicensePath = join(installedPackageRoot, "LICENSE");
    const [sourceLicense, installedLicense] = await Promise.all([
        readFile(sourceLicensePath),
        readFile(installedLicensePath),
    ]);
    if (!sourceLicense.equals(installedLicense)) {
        throw new Error(
            "Installed LICENSE does not match the repository license.",
        );
    }

    const emittedFiles = await listFiles(sourceDistRoot);
    if (emittedFiles.length === 0) {
        throw new Error(
            "Source dist is empty; there are no emitted files to validate.",
        );
    }
    for (const emittedFile of emittedFiles) {
        const sourcePath = join(sourceDistRoot, emittedFile);
        const installedPath = join(installedPackageRoot, "dist", emittedFile);
        let installedContents;
        try {
            installedContents = await readFile(installedPath);
        } catch (error) {
            if (error?.code === "ENOENT") {
                throw new Error(
                    `Installed package is missing emitted dist file: ${emittedFile}.`,
                );
            }
            throw error;
        }
        const sourceContents = await readFile(sourcePath);
        if (!sourceContents.equals(installedContents)) {
            throw new Error(
                `Installed dist file differs from the emitted file: ${emittedFile}.`,
            );
        }
    }

    return { manifest, emittedFiles };
}

function exportTargets(manifest) {
    return [
        manifest.main,
        manifest.module,
        manifest.types,
        manifest.style,
        manifest.exports["."].types,
        manifest.exports["."].import,
        manifest.exports["./style.css"],
        manifest.exports["./package.json"],
    ];
}

async function listFiles(root) {
    const files = [];
    await visit(root);
    return files.sort();

    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolute = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolute);
            } else {
                const metadata = await lstat(absolute);
                if (!metadata.isFile()) {
                    throw new Error(
                        `Emitted dist entry is not a regular file: ${relative(root, absolute)}.`,
                    );
                }
                files.push(relative(root, absolute));
            }
        }
    }
}

function isStableSemver(version) {
    return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version);
}
