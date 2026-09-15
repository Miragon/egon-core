import { spawn } from "node:child_process";
import {
    access,
    cp,
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import {
    extractCssAssetReferences,
    inspectPackageContract,
} from "./package-contract.mjs";

const REQUIRED_NODE_MAJOR = 24;
const READY_TIMEOUT_MS = 120_000;
const STARTER_ICON_MARKERS = ["M12 4a4 4 0 1 1 0 8", "M6 2h8l6 6v16"];
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const activeChildren = new Set();
let interrupted = false;

if (Number.parseInt(process.versions.node, 10) < REQUIRED_NODE_MAJOR) {
    throw new Error(
        `Package validation requires Node ${REQUIRED_NODE_MAJOR} or newer (active: ${process.versions.node}).`,
    );
}

const archiveArgument = parseArguments(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), "egon-core-package-test-"));
const consumerRoot = join(temporaryRoot, "consumer");

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        interrupted = true;
        process.exitCode = signal === "SIGINT" ? 130 : 143;
        for (const child of activeChildren) child.kill(signal);
    });
}

try {
    const repositoryPackage = JSON.parse(
        await readFile(join(repositoryRoot, "package.json"), "utf8"),
    );
    const archivePath = archiveArgument
        ? resolve(archiveArgument)
        : join(temporaryRoot, "egon-core.tgz");

    if (archiveArgument) {
        await access(archivePath);
    } else {
        await run("yarn", ["pack", "--out", archivePath], repositoryRoot);
    }

    await stageConsumer(consumerRoot, archivePath, repositoryPackage);

    const isolatedEnvironment = {
        ...process.env,
        YARN_ENABLE_GLOBAL_CACHE: "false",
        YARN_ENABLE_TELEMETRY: "false",
    };
    // This disposable project intentionally has no pre-existing lockfile. CI's
    // Yarn default is immutable, so opt out for this one generated install.
    await run(
        "yarn",
        ["install", "--no-immutable"],
        consumerRoot,
        isolatedEnvironment,
    );

    const installedPackageRoot = join(
        consumerRoot,
        "node_modules",
        "egon-core",
    );
    const { emittedFiles } = await inspectPackageContract({
        installedPackageRoot,
        sourceDistRoot: join(repositoryRoot, "dist"),
        expectedVersion: repositoryPackage.version,
        sourceLicensePath: join(repositoryRoot, "LICENSE"),
    });
    console.log(
        `Validated package identity, license, exports, and ${emittedFiles.length} emitted dist files.`,
    );
    await inspectPackagedStyles(installedPackageRoot);
    await inspectPreactIntegration(consumerRoot, installedPackageRoot);
    await run(
        "yarn",
        ["tsc", "--project", "tsconfig.json", "--noEmit"],
        consumerRoot,
        isolatedEnvironment,
    );
    await run(
        "yarn",
        ["vite", "build", "--config", "vite.config.mts"],
        consumerRoot,
        isolatedEnvironment,
    );
    await verifyOptionalIconBundles(consumerRoot, isolatedEnvironment);

    const server = startPackageServer(consumerRoot, isolatedEnvironment);
    try {
        const portlessUrl = await server.ready;
        await run(
            join(repositoryRoot, "node_modules", ".bin", "playwright"),
            ["test"],
            repositoryRoot,
            {
                ...process.env,
                EGON_E2E_EXTERNAL_SERVER: "1",
                EGON_PLAYWRIGHT_HTML_DIR: "playwright-report/package",
                EGON_PLAYWRIGHT_OUTPUT_DIR: "test-results/package",
                PORTLESS_URL: portlessUrl,
            },
        );
    } finally {
        await stopChild(server.child);
    }
} finally {
    await Promise.all(Array.from(activeChildren, (child) => stopChild(child)));
    await rm(temporaryRoot, { recursive: true, force: true });
}

async function inspectPreactIntegration(consumerRoot, packageRoot) {
    const distRoot = join(packageRoot, "dist");
    const javascript = (await readdir(distRoot)).filter((file) =>
        file.endsWith(".js"),
    );
    const dist = (
        await Promise.all(
            javascript.map((file) => readFile(join(distRoot, file), "utf8")),
        )
    ).join("\n");
    if (/from\s*["']react(?:\/|["'])/.test(dist)) {
        throw new Error("Bundled picker still contains a React import.");
    }
    if (/from\s*["']preact(?:\/|["'])/.test(dist)) {
        throw new Error("Bundled picker bypasses diagram-js's Preact runtime.");
    }

    const consumerRequire = createRequire(join(consumerRoot, "package.json"));
    const pickerChunk = javascript.find((file) =>
        file.startsWith("DefaultColorPickerProvider-"),
    );
    if (!pickerChunk) {
        throw new Error(
            "Installed package has no bundled default picker chunk.",
        );
    }
    const pickerSource = await readFile(join(distRoot, pickerChunk), "utf8");
    if (!pickerSource.includes("diagram-js/lib/ui")) {
        throw new Error(
            "Bundled picker does not share diagram-js's Preact UI runtime.",
        );
    }
    try {
        consumerRequire.resolve("react");
        throw new Error("The isolated consumer unexpectedly installed React.");
    } catch (error) {
        if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }

    await access(join(packageRoot, "dist", "THIRD_PARTY_NOTICES.txt"));
    const hostConfig = await readFile(
        join(consumerRoot, "vite.config.mts"),
        "utf8",
    );
    if (/\balias\s*:/.test(hostConfig)) {
        throw new Error("The isolated consumer unexpectedly defines aliases.");
    }
    const manifest = JSON.parse(
        await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    if (manifest.dependencies?.preact !== "10.29.7") {
        throw new Error("Installed package does not pin Preact 10.29.7.");
    }
    console.log(
        "Validated React-free shared Preact runtime and bundled notices.",
    );
}

if (interrupted) process.exit(process.exitCode ?? 1);

function parseArguments(arguments_) {
    if (arguments_.length === 0) return undefined;
    if (arguments_.length === 2 && arguments_[0] === "--archive") {
        if (!arguments_[1].endsWith(".tgz")) {
            throw new Error("--archive must point to a .tgz package archive.");
        }
        return arguments_[1];
    }
    throw new Error("Usage: yarn test:package [--archive <path.tgz>]");
}

async function stageConsumer(root, archivePath, repositoryPackage) {
    await mkdir(root, { recursive: true });
    for (const file of ["index.html", "main.ts", "styles.css"]) {
        await cp(join(repositoryRoot, "demo", file), join(root, file));
    }

    const packageManifest = {
        name: "egon-core-package-consumer",
        private: true,
        version: "0.0.0",
        type: "module",
        packageManager: repositoryPackage.packageManager,
        dependencies: {
            "egon-core": `file:${archivePath}`,
        },
        devDependencies: {
            "@typescript/native":
                repositoryPackage.devDependencies["@typescript/native"],
            vite: repositoryPackage.devDependencies.vite,
        },
    };
    await writeFile(
        join(root, "package.json"),
        `${JSON.stringify(packageManifest, null, 4)}\n`,
    );
    await writeFile(
        join(root, ".yarnrc.yml"),
        [
            "enableGlobalCache: false",
            "enableTelemetry: false",
            "enableTransparentWorkspaces: false",
            "nodeLinker: node-modules",
            "",
        ].join("\n"),
    );
    await writeFile(
        join(root, "tsconfig.json"),
        `${JSON.stringify(
            {
                compilerOptions: {
                    lib: ["DOM", "DOM.Iterable", "ES2022"],
                    module: "ESNext",
                    moduleResolution: "Bundler",
                    noEmit: true,
                    strict: true,
                    target: "ES2022",
                    types: ["vite/client"],
                },
                include: ["main.ts"],
            },
            null,
            4,
        )}\n`,
    );
    await writeFile(
        join(root, "vite.config.mts"),
        `import { defineConfig, type Plugin } from "vite";\n\nfunction announceReady(): Plugin {\n    return {\n        name: "announce-package-preview-url",\n        configurePreviewServer(server) {\n            server.httpServer?.once("listening", () => {\n                const url = process.env.PORTLESS_URL;\n                if (!url) throw new Error("PORTLESS_URL is missing.");\n                console.log(\`EGON_PACKAGE_READY \${url}\`);\n            });\n        },\n    };\n}\n\nexport default defineConfig({\n    plugins: [announceReady()],\n    preview: { host: "127.0.0.1", strictPort: true },\n});\n`,
    );

    await Promise.all([
        stageBundleFixture(root, "client-only", false),
        stageBundleFixture(root, "opted-in", true),
    ]);
}

async function stageBundleFixture(consumerRoot, name, includeIcons) {
    const root = join(consumerRoot, "bundle-fixtures", name);
    await mkdir(root, { recursive: true });
    await writeFile(
        join(root, "index.html"),
        '<div id="canvas"></div><script type="module" src="/main.ts"></script>\n',
    );
    await writeFile(
        join(root, "main.ts"),
        [
            'import { EgonClient } from "egon-core";',
            ...(includeIcons
                ? ['import { defaultIcons } from "egon-core/icons";']
                : []),
            'const container = document.querySelector<HTMLElement>("#canvas")!;',
            `void EgonClient.create({ container, colorPicker: false${includeIcons ? ", defaultIcons" : ""} }).then((client) => client.destroy());`,
            "",
        ].join("\n"),
    );
    await writeFile(
        join(root, "vite.config.mts"),
        `import { defineConfig } from "vite";\nimport { fileURLToPath } from "node:url";\n\nexport default defineConfig({\n    root: fileURLToPath(new URL(".", import.meta.url)),\n    build: { outDir: "dist", emptyOutDir: true },\n});\n`,
    );
}

async function verifyOptionalIconBundles(consumerRoot, environment) {
    const fixtureRoot = join(consumerRoot, "bundle-fixtures");
    for (const name of ["client-only", "opted-in"]) {
        await run(
            "yarn",
            [
                "vite",
                "build",
                "--config",
                join("bundle-fixtures", name, "vite.config.mts"),
            ],
            consumerRoot,
            environment,
        );
    }

    const [clientOnly, optedIn] = await Promise.all([
        readBundleText(join(fixtureRoot, "client-only", "dist")),
        readBundleText(join(fixtureRoot, "opted-in", "dist")),
    ]);
    for (const marker of STARTER_ICON_MARKERS) {
        if (clientOnly.includes(marker)) {
            throw new Error(
                `Client-only consumer bundle unexpectedly contains starter artwork: ${marker}.`,
            );
        }
        if (!optedIn.includes(marker)) {
            throw new Error(
                `Opted-in consumer bundle is missing starter artwork: ${marker}.`,
            );
        }
    }
    console.log(
        "Validated starter icon exclusion and inclusion in isolated consumer bundles.",
    );
}

async function readBundleText(root) {
    const contents = [];
    await visit(root);
    return contents.join("\n");

    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolute = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolute);
            } else if (entry.isFile()) {
                contents.push(await readFile(absolute, "utf8"));
            }
        }
    }
}

async function inspectPackagedStyles(packageRoot) {
    const stylesheetPath = join(packageRoot, "dist", "style.css");
    const stylesheet = await readFile(stylesheetPath, "utf8");
    for (const requiredRule of [
        ".djs-palette",
        ".djs-context-pad",
        "@font-face",
        ".icon-domain-story-tool-group",
    ]) {
        if (!stylesheet.includes(requiredRule)) {
            throw new Error(
                `Installed style.css is missing required rule ${requiredRule}.`,
            );
        }
    }

    const references = extractCssAssetReferences(stylesheet);
    if (references.length === 0) {
        throw new Error("Installed style.css contains no asset references.");
    }

    for (const reference of references) {
        if (reference.startsWith("data:")) {
            validateDataUrl(reference);
            continue;
        }
        if (/^(?:[a-z]+:|\/|#)/i.test(reference)) {
            throw new Error(
                `Installed style.css contains a non-package asset URL: ${reference}`,
            );
        }
        const assetPath = resolve(
            dirname(stylesheetPath),
            reference.replace(/[?#].*$/, ""),
        );
        const packageRelative = relative(packageRoot, assetPath);
        if (packageRelative.startsWith("..")) {
            throw new Error(
                `Installed style.css asset escapes the package: ${reference}`,
            );
        }
        await access(assetPath);
    }

    console.log(
        `Validated ${references.length} asset references in installed egon-core/style.css.`,
    );
}

function validateDataUrl(reference) {
    const match = /^data:([^,]*),(.*)$/s.exec(reference);
    if (!match) throw new Error("Malformed data URL in installed style.css.");
    const metadata = match[1];
    const payload = match[2];
    let decoded;
    if (metadata.split(";").includes("base64")) {
        if (!/^[a-z\d+/]*={0,2}$/i.test(payload)) {
            throw new Error("Invalid base64 asset in installed style.css.");
        }
        decoded = Buffer.from(payload, "base64");
    } else {
        try {
            decoded = Buffer.from(decodeURIComponent(payload), "utf8");
        } catch {
            throw new Error(
                "Invalid percent-encoded asset in installed style.css.",
            );
        }
    }
    if (decoded.length === 0) {
        throw new Error("Empty embedded asset in installed style.css.");
    }
    if (metadata.startsWith("image/svg+xml") && !decoded.includes("<svg")) {
        throw new Error("Embedded SVG asset does not decode to SVG markup.");
    }
}

function startPackageServer(root, environment) {
    const portless = join(repositoryRoot, "node_modules", ".bin", "portless");
    const vite = join(root, "node_modules", ".bin", "vite");
    const child = spawn(
        portless,
        [
            "run",
            "--name",
            `egon-core-package-e2e-${process.pid}`,
            vite,
            "preview",
            "--config",
            "vite.config.mts",
        ],
        {
            cwd: root,
            env: portlessEnvironment(environment),
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    activeChildren.add(child);
    child.once("exit", () => activeChildren.delete(child));

    let output = "";
    const ready = new Promise((resolveReady, rejectReady) => {
        const timeout = setTimeout(() => {
            rejectReady(
                new Error("Timed out waiting for the package preview server."),
            );
        }, READY_TIMEOUT_MS);
        const inspect = (chunk, destination) => {
            const text = chunk.toString();
            destination.write(text);
            output += text;
            const match = /EGON_PACKAGE_READY (http:\/\/[^\s]+)/.exec(output);
            if (match?.[1]) {
                clearTimeout(timeout);
                resolveReady(match[1]);
            }
        };
        child.stdout.on("data", (chunk) => inspect(chunk, process.stdout));
        child.stderr.on("data", (chunk) => inspect(chunk, process.stderr));
        child.once("error", (error) => {
            clearTimeout(timeout);
            rejectReady(error);
        });
        child.once("exit", (code, signal) => {
            clearTimeout(timeout);
            rejectReady(
                new Error(
                    `Package preview exited before readiness (${signal ?? code}).`,
                ),
            );
        });
    });
    return { child, ready };
}

function portlessEnvironment(environment) {
    const uid = process.getuid?.() ?? "user";
    return {
        ...environment,
        PORTLESS_PORT: process.env.PORTLESS_PORT ?? "1355",
        PORTLESS_STATE_DIR:
            process.env.PORTLESS_STATE_DIR ??
            join(tmpdir(), `egon-core-portless-${uid}`),
        PORTLESS_HTTPS: "0",
        PORTLESS_LAN: "0",
        PORTLESS_SYNC_HOSTS: "0",
        PORTLESS_TLD: "localhost",
    };
}

async function run(command, args, cwd, environment = process.env) {
    if (interrupted) throw new Error("Package validation was interrupted.");
    await new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, args, {
            cwd,
            env: environment,
            stdio: "inherit",
        });
        activeChildren.add(child);
        child.once("error", (error) => {
            activeChildren.delete(child);
            rejectRun(error);
        });
        child.once("exit", (code, signal) => {
            activeChildren.delete(child);
            if (code === 0) resolveRun();
            else {
                rejectRun(
                    new Error(
                        `${command} failed (${signal ?? `exit ${code ?? 1}`}).`,
                    ),
                );
            }
        });
    });
}

async function stopChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolveStop) => {
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            resolveStop();
        }, 5_000);
        child.once("exit", () => {
            clearTimeout(timeout);
            resolveStop();
        });
    });
}
