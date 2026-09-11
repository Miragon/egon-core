import { execFile } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    utimes,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    compareArchiveContents,
    runReleaseArchive,
    verifySourceIdentity,
} from "../release-archive.mjs";

const execFileAsync = promisify(execFile);
const temporaryRoots = [];

afterEach(async () => {
    await Promise.all(
        temporaryRoots
            .splice(0)
            .map((root) => rm(root, { recursive: true, force: true })),
    );
});

describe("release archive orchestration", () => {
    it("validates a selected ref without requiring or uploading a release", async () => {
        const { github, calls } = fakeGitHub();

        const result = await run(false, github);

        expect(result.status).toBe("validated");
        expect(calls.getPublishedRelease).not.toHaveBeenCalled();
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("stops before building when the published release is missing", async () => {
        const { github } = fakeGitHub({
            getPublishedRelease: vi
                .fn()
                .mockRejectedValue(new Error("missing")),
        });
        const buildArchive = vi.fn();

        await expect(run(true, github, { buildArchive })).rejects.toThrow(
            "missing",
        );
        expect(buildArchive).not.toHaveBeenCalled();
    });

    it("stops before building when tag, package, and manifest versions disagree", async () => {
        const { github, calls } = fakeGitHub();
        const buildArchive = vi.fn();

        await expect(
            run(true, github, {
                buildArchive,
                verifySourceIdentity: vi
                    .fn()
                    .mockRejectedValue(new Error("version mismatch")),
            }),
        ).rejects.toThrow("version mismatch");
        expect(buildArchive).not.toHaveBeenCalled();
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("cannot upload after a build failure", async () => {
        const { github, calls } = fakeGitHub();

        await expect(
            run(true, github, {
                buildArchive: vi
                    .fn()
                    .mockRejectedValue(new Error("build failed")),
            }),
        ).rejects.toThrow("build failed");
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("cannot upload after a validation failure", async () => {
        const { github, calls } = fakeGitHub();

        await expect(
            run(true, github, {
                validateArchive: vi
                    .fn()
                    .mockRejectedValue(new Error("validation failed")),
            }),
        ).rejects.toThrow("validation failed");
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("refuses to upload when the tag moves during validation", async () => {
        const { github, calls } = fakeGitHub({
            resolveTagCommit: vi
                .fn()
                .mockResolvedValueOnce("a".repeat(40))
                .mockResolvedValueOnce("b".repeat(40)),
        });

        await expect(run(true, github)).rejects.toThrow(
            "Tag v0.1.0 moved during validation",
        );
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("preserves a matching existing asset without replacing it", async () => {
        const asset = { id: 11, name: "egon-core-0.1.0.tgz", url: "asset" };
        const { github, calls } = fakeGitHub({ assets: [asset] });

        const result = await run(true, github, {
            compareArchiveContents: vi.fn().mockResolvedValue(true),
        });

        expect(result.status).toBe("existing");
        expect(calls.downloadAsset).toHaveBeenCalledWith(
            asset,
            expect.any(String),
        );
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("fails without overwriting a conflicting existing asset", async () => {
        const { github, calls } = fakeGitHub({
            assets: [{ id: 11, name: "egon-core-0.1.0.tgz", url: "asset" }],
        });

        await expect(
            run(true, github, {
                compareArchiveContents: vi.fn().mockResolvedValue(false),
            }),
        ).rejects.toThrow("refusing to overwrite");
        expect(calls.uploadAsset).not.toHaveBeenCalled();
    });

    it("recovers a failed upload by accepting the matching asset on retry", async () => {
        const state = { assets: [] };
        const uploadAsset = vi.fn(async () => {
            state.assets.push({
                id: 12,
                name: "egon-core-0.1.0.tgz",
                url: "asset",
            });
            throw new Error("connection lost after upload");
        });
        const { github } = fakeGitHub({ state, uploadAsset });

        await expect(run(true, github)).rejects.toThrow(
            "connection lost after upload",
        );
        const retry = await run(true, github, {
            compareArchiveContents: vi.fn().mockResolvedValue(true),
        });

        expect(retry.status).toBe("existing");
        expect(uploadAsset).toHaveBeenCalledTimes(1);
    });

    it("downloads a new asset and rejects a checksum mismatch", async () => {
        const { github } = fakeGitHub();
        const checksum = vi
            .fn()
            .mockResolvedValueOnce("expected")
            .mockResolvedValueOnce("different");

        await expect(run(true, github, { checksum })).rejects.toThrow(
            "Uploaded asset checksum mismatch",
        );
    });
});

describe("release archive identity", () => {
    it("requires tag, package, and manifest versions to agree", async () => {
        const root = await temporaryRoot();
        await writeFile(
            join(root, "package.json"),
            '{"name":"egon-core","version":"0.1.0"}\n',
        );
        await writeFile(
            join(root, ".release-please-manifest.json"),
            '{".":"0.2.0"}\n',
        );

        await expect(verifySourceIdentity(root, "0.1.0")).rejects.toThrow(
            "does not match manifest version 0.2.0",
        );
    });

    it("compares extracted files instead of archive timestamps", async () => {
        const root = await temporaryRoot();
        const first = await createArchive(root, "first", "same", 1_700_000_000);
        const second = await createArchive(
            root,
            "second",
            "same",
            1_800_000_000,
        );
        const conflict = await createArchive(
            root,
            "conflict",
            "different",
            1_800_000_000,
        );

        expect(await readFile(first)).not.toEqual(await readFile(second));
        await expect(compareArchiveContents(first, second)).resolves.toBe(true);
        await expect(compareArchiveContents(first, conflict)).resolves.toBe(
            false,
        );
    });
});

async function run(upload, github, overrides = {}) {
    return runReleaseArchive(
        {
            ref: upload ? "v0.1.0" : "main",
            upload,
            runnerTemp: "/temporary",
            repository: "Miragon/egon-core",
            token: "test-token",
            logger: { log: vi.fn() },
        },
        {
            github,
            downloadSource: vi.fn(),
            readPackageVersion: vi.fn().mockResolvedValue("0.1.0"),
            verifySourceIdentity: vi.fn().mockResolvedValue("0.1.0"),
            prepareSource: vi.fn(),
            buildArchive: vi.fn(),
            validateArchive: vi.fn(),
            checksum: vi.fn().mockResolvedValue("checksum"),
            ...overrides,
        },
    );
}

function fakeGitHub(overrides = {}) {
    const state = overrides.state ?? { assets: overrides.assets ?? [] };
    const release = () => ({
        id: 7,
        draft: false,
        tag_name: "v0.1.0",
        upload_url: "https://uploads.example/releases/7/assets{?name,label}",
        assets: state.assets,
    });
    const calls = {
        resolveCommit: vi.fn().mockResolvedValue("a".repeat(40)),
        resolveTagCommit:
            overrides.resolveTagCommit ??
            vi.fn().mockResolvedValue("a".repeat(40)),
        getPublishedRelease:
            overrides.getPublishedRelease ?? vi.fn(async () => release()),
        downloadSource: vi.fn(),
        downloadAsset: vi.fn(),
        uploadAsset:
            overrides.uploadAsset ??
            vi.fn().mockResolvedValue({ id: 12, url: "uploaded" }),
    };
    return { github: calls, calls };
}

async function temporaryRoot() {
    const root = await mkdtemp(join(tmpdir(), "egon-core-release-test-"));
    temporaryRoots.push(root);
    return root;
}

async function createArchive(root, name, contents, modifiedSeconds) {
    const source = join(root, name, "package");
    await mkdir(source, { recursive: true });
    const file = join(source, "index.js");
    await writeFile(file, contents);
    const modified = new Date(modifiedSeconds * 1000);
    await utimes(file, modified, modified);
    const archive = join(root, `${name}.tgz`);
    await execFileAsync("tar", [
        "-czf",
        archive,
        "-C",
        join(root, name),
        "package",
    ]);
    return archive;
}
