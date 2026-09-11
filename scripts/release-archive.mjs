import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";

const REQUIRED_NODE_MAJOR = 24;
const VERSION_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

export async function runReleaseArchive(options, overrides = {}) {
    const {
        ref,
        upload,
        runnerTemp,
        repository,
        apiUrl = "https://api.github.com",
        token,
        logger = console,
    } = options;
    if (!ref) throw new Error("A source ref is required.");
    if (!runnerTemp)
        throw new Error("A runner temporary directory is required.");

    const github =
        overrides.github ??
        new GitHubReleaseClient({
            repository,
            apiUrl,
            token,
            fetchImpl: globalThis.fetch,
        });
    const sourceRoot = join(runnerTemp, "egon-core-source");
    let releaseIdentity;
    let commit;

    if (upload) {
        const version = versionFromTag(ref);
        const [release, tagCommit] = await Promise.all([
            github.getPublishedRelease(ref),
            github.resolveTagCommit(ref),
        ]);
        releaseIdentity = {
            id: release.id,
            tag: ref,
            version,
            commit: tagCommit,
        };
        commit = tagCommit;
    } else {
        commit = await github.resolveCommit(ref);
    }

    await (overrides.downloadSource ?? defaultDownloadSource)({
        github,
        commit,
        sourceRoot,
        runnerTemp,
    });

    const packageVersion = releaseIdentity
        ? await (overrides.verifySourceIdentity ?? verifySourceIdentity)(
              sourceRoot,
              releaseIdentity.version,
          )
        : await (overrides.readPackageVersion ?? readPackageVersion)(
              sourceRoot,
          );
    const archivePath = join(runnerTemp, `egon-core-${packageVersion}.tgz`);

    await (overrides.prepareSource ?? defaultPrepareSource)(sourceRoot);
    await (overrides.buildArchive ?? defaultBuildArchive)({
        sourceRoot,
        archivePath,
    });
    await (overrides.validateArchive ?? defaultValidateArchive)({
        sourceRoot,
        archivePath,
    });

    logger.log(`Validated ${basename(archivePath)} from commit ${commit}.`);
    if (!releaseIdentity) {
        return { status: "validated", archivePath, commit, packageVersion };
    }

    const [release, tagCommit] = await Promise.all([
        github.getPublishedRelease(releaseIdentity.tag),
        github.resolveTagCommit(releaseIdentity.tag),
    ]);
    if (release.id !== releaseIdentity.id) {
        throw new Error(
            `Release identity changed during validation (${releaseIdentity.id} -> ${release.id}).`,
        );
    }
    if (tagCommit !== releaseIdentity.commit) {
        throw new Error(
            `Tag ${releaseIdentity.tag} moved during validation (${releaseIdentity.commit} -> ${tagCommit}).`,
        );
    }

    const assetName = basename(archivePath);
    const existing = release.assets.find((asset) => asset.name === assetName);
    if (existing) {
        const existingPath = join(runnerTemp, `existing-${assetName}`);
        await github.downloadAsset(existing, existingPath);
        const matches = await (
            overrides.compareArchiveContents ?? compareArchiveContents
        )(archivePath, existingPath);
        if (!matches) {
            throw new Error(
                `Release asset ${assetName} already exists with different contents; refusing to overwrite it.`,
            );
        }
        logger.log(
            `Release asset ${assetName} already has matching contents; preserving it.`,
        );
        return {
            status: "existing",
            archivePath,
            commit,
            packageVersion,
        };
    }

    const uploaded = await github.uploadAsset(release, archivePath, assetName);
    const downloadedPath = join(runnerTemp, `uploaded-${assetName}`);
    await github.downloadAsset(uploaded, downloadedPath);
    const checksum = overrides.checksum ?? sha256;
    const [expectedChecksum, uploadedChecksum] = await Promise.all([
        checksum(archivePath),
        checksum(downloadedPath),
    ]);
    if (uploadedChecksum !== expectedChecksum) {
        throw new Error(
            `Uploaded asset checksum mismatch for ${assetName}: expected ${expectedChecksum}, received ${uploadedChecksum}.`,
        );
    }

    logger.log(`Uploaded and checksum-verified ${assetName}.`);
    return { status: "uploaded", archivePath, commit, packageVersion };
}

export class GitHubReleaseClient {
    constructor({ repository, apiUrl, token, fetchImpl }) {
        if (!repository?.includes("/")) {
            throw new Error("GITHUB_REPOSITORY must have the form owner/repo.");
        }
        if (!token) throw new Error("GITHUB_TOKEN is required.");
        this.repository = repository;
        this.apiUrl = apiUrl.replace(/\/$/, "");
        this.token = token;
        this.fetch = fetchImpl;
    }

    async resolveCommit(ref) {
        const commit = await this.requestJson(
            `${this.apiUrl}/repos/${this.repository}/commits/${encodeURIComponent(ref)}`,
        );
        if (!/^[a-f\d]{40}$/i.test(commit.sha ?? "")) {
            throw new Error(
                `GitHub returned an invalid commit SHA for ${ref}.`,
            );
        }
        return commit.sha;
    }

    async resolveTagCommit(tag) {
        const encodedTag = tag
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/");
        let reference = await this.requestJson(
            `${this.apiUrl}/repos/${this.repository}/git/ref/tags/${encodedTag}`,
        );
        let object = reference.object;
        for (let depth = 0; object?.type === "tag" && depth < 10; depth += 1) {
            reference = await this.requestJson(
                `${this.apiUrl}/repos/${this.repository}/git/tags/${object.sha}`,
            );
            object = reference.object;
        }
        if (
            object?.type !== "commit" ||
            !/^[a-f\d]{40}$/i.test(object.sha ?? "")
        ) {
            throw new Error(`Tag ${tag} does not resolve to a commit.`);
        }
        return object.sha;
    }

    async getPublishedRelease(tag) {
        let release;
        try {
            release = await this.requestJson(
                `${this.apiUrl}/repos/${this.repository}/releases/tags/${encodeURIComponent(tag)}`,
            );
        } catch (error) {
            if (error.status === 404) {
                throw new Error(
                    `Published release ${tag} does not exist; archive recovery never creates releases.`,
                );
            }
            throw error;
        }
        if (release.draft || release.tag_name !== tag) {
            throw new Error(
                `Release ${tag} is not a matching published release.`,
            );
        }
        return release;
    }

    async downloadSource(commit, destination) {
        const response = await this.request(
            `${this.apiUrl}/repos/${this.repository}/tarball/${commit}`,
        );
        await mkdir(destination, { recursive: true });
        const archivePath = join(destination, "..", `source-${commit}.tar.gz`);
        await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
        await run("tar", [
            "-xzf",
            archivePath,
            "--strip-components=1",
            "-C",
            destination,
        ]);
    }

    async downloadAsset(asset, destination) {
        const response = await this.request(asset.url, {
            headers: { Accept: "application/octet-stream" },
        });
        await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    }

    async uploadAsset(release, archivePath, assetName) {
        const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ""));
        uploadUrl.searchParams.set("name", assetName);
        return this.requestJson(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/gzip" },
            body: await readFile(archivePath),
        });
    }

    async requestJson(url, init) {
        const response = await this.request(url, init);
        return response.json();
    }

    async request(url, init = {}) {
        const response = await this.fetch(url, {
            ...init,
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${this.token}`,
                "X-GitHub-Api-Version": "2022-11-28",
                ...init.headers,
            },
        });
        if (!response.ok) {
            const error = new Error(
                `GitHub request failed (${response.status}) for ${url}.`,
            );
            error.status = response.status;
            throw error;
        }
        return response;
    }
}

export async function verifySourceIdentity(sourceRoot, expectedVersion) {
    const [packageManifest, releaseManifest] = await Promise.all([
        readJson(join(sourceRoot, "package.json")),
        readJson(join(sourceRoot, ".release-please-manifest.json")),
    ]);
    if (packageManifest.name !== "egon-core") {
        throw new Error(
            `Released package name must be egon-core (received ${packageManifest.name}).`,
        );
    }
    if (packageManifest.version !== expectedVersion) {
        throw new Error(
            `Tag version ${expectedVersion} does not match package version ${packageManifest.version}.`,
        );
    }
    if (releaseManifest["."] !== expectedVersion) {
        throw new Error(
            `Tag version ${expectedVersion} does not match manifest version ${releaseManifest["."]}.`,
        );
    }
    return packageManifest.version;
}

export async function compareArchiveContents(firstArchive, secondArchive) {
    const extractionRoot = await mkdtemp(join(tmpdir(), "egon-core-archives-"));
    try {
        const firstRoot = join(extractionRoot, "first");
        const secondRoot = join(extractionRoot, "second");
        await Promise.all([
            extractArchive(firstArchive, firstRoot),
            extractArchive(secondArchive, secondRoot),
        ]);
        const [firstEntries, secondEntries] = await Promise.all([
            describeTree(firstRoot),
            describeTree(secondRoot),
        ]);
        return JSON.stringify(firstEntries) === JSON.stringify(secondEntries);
    } finally {
        await rm(extractionRoot, { recursive: true, force: true });
    }
}

export async function sha256(path) {
    return createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
}

function versionFromTag(tag) {
    const match = VERSION_TAG.exec(tag);
    if (!match) {
        throw new Error(
            `Upload ref must be an exact stable version tag such as v0.1.0 (received ${tag}).`,
        );
    }
    return match[1];
}

async function readPackageVersion(sourceRoot) {
    const manifest = await readJson(join(sourceRoot, "package.json"));
    if (
        manifest.name !== "egon-core" ||
        !VERSION_TAG.test(`v${manifest.version}`)
    ) {
        throw new Error(
            "Selected source does not contain a valid egon-core package.",
        );
    }
    return manifest.version;
}

async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}

async function defaultDownloadSource({ github, commit, sourceRoot }) {
    await rm(sourceRoot, { recursive: true, force: true });
    await github.downloadSource(commit, sourceRoot);
}

async function defaultPrepareSource(sourceRoot) {
    await run("corepack", ["enable"], sourceRoot);
    await run("yarn", ["install", "--immutable"], sourceRoot);
    await run(
        "yarn",
        ["playwright", "install", "--with-deps", "chromium"],
        sourceRoot,
    );
}

async function defaultBuildArchive({ sourceRoot, archivePath }) {
    await run("yarn", ["pack", "--out", archivePath], sourceRoot);
}

async function defaultValidateArchive({ sourceRoot, archivePath }) {
    await run("yarn", ["test:package", "--archive", archivePath], sourceRoot);
}

async function extractArchive(archive, destination) {
    const listing = await capture("tar", ["-tzf", archive]);
    for (const entry of listing.split("\n").filter(Boolean)) {
        if (
            entry.startsWith("/") ||
            entry.split("/").includes("..") ||
            !(entry === "package" || entry.startsWith("package/"))
        ) {
            throw new Error(`Unsafe package archive entry: ${entry}.`);
        }
    }
    await mkdir(destination, { recursive: true });
    await run("tar", ["-xzf", archive, "-C", destination]);
}

async function describeTree(root) {
    const descriptions = [];
    await visit(root);
    return descriptions.sort((left, right) =>
        left.path.localeCompare(right.path),
    );

    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolute = join(directory, entry.name);
            const path = relative(root, absolute).split(sep).join("/");
            const metadata = await lstat(absolute);
            const mode = metadata.mode & 0o777;
            if (entry.isDirectory()) {
                descriptions.push({ path, type: "directory", mode });
                await visit(absolute);
            } else if (entry.isFile()) {
                descriptions.push({
                    path,
                    type: "file",
                    mode,
                    checksum: await sha256(absolute),
                });
            } else {
                throw new Error(`Unsupported archive entry type: ${path}.`);
            }
        }
    }
}

async function capture(command, arguments_, cwd = process.cwd()) {
    return new Promise((resolveCapture, rejectCapture) => {
        const child = spawn(command, arguments_, {
            cwd,
            stdio: ["ignore", "pipe", "inherit"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk;
        });
        child.once("error", rejectCapture);
        child.once("exit", (code, signal) => {
            if (code === 0) resolveCapture(output);
            else {
                rejectCapture(
                    new Error(
                        `${command} failed (${signal ?? `exit ${code ?? 1}`}).`,
                    ),
                );
            }
        });
    });
}

async function run(command, arguments_, cwd = process.cwd()) {
    await new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, arguments_, { cwd, stdio: "inherit" });
        child.once("error", rejectRun);
        child.once("exit", (code, signal) => {
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

function parseArguments(arguments_) {
    let ref;
    let upload = false;
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === "--ref" && arguments_[index + 1]) {
            ref = arguments_[index + 1];
            index += 1;
        } else if (argument === "--upload") {
            upload = true;
        } else {
            throw new Error(
                "Usage: node scripts/release-archive.mjs --ref <ref> [--upload]",
            );
        }
    }
    if (!ref) {
        throw new Error(
            "Usage: node scripts/release-archive.mjs --ref <ref> [--upload]",
        );
    }
    return { ref, upload };
}

async function main() {
    if (Number.parseInt(process.versions.node, 10) < REQUIRED_NODE_MAJOR) {
        throw new Error(
            `Release archives require Node ${REQUIRED_NODE_MAJOR} or newer (active: ${process.versions.node}).`,
        );
    }
    const { ref, upload } = parseArguments(process.argv.slice(2));
    await runReleaseArchive({
        ref,
        upload,
        runnerTemp: process.env.RUNNER_TEMP,
        repository: process.env.GITHUB_REPOSITORY,
        apiUrl: process.env.GITHUB_API_URL,
        token: process.env.GITHUB_TOKEN,
    });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
    await main();
}
