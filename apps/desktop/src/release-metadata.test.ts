import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = resolve(import.meta.dirname, "../scripts/release-metadata.mjs");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "earth-stories-release-"));
  const artifacts = join(root, "artifacts");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(artifacts);
  await Promise.all([
    writeFile(join(artifacts, "builder-debug.yml"), "packager diagnostics\n"),
    writeFile(
      join(artifacts, "earth-stories-0.1.0-linux-x86_64.AppImage"),
      "linux artifact\n",
    ),
    writeFile(
      join(artifacts, "earth-stories-0.1.0-linux-amd64.deb"),
      "linux package\n",
    ),
    writeFile(
      join(artifacts, "earth-stories-0.1.0-mac-arm64.dmg"),
      "mac artifact\n",
    ),
    writeFile(
      join(artifacts, "earth-stories-0.1.0-win-x64.exe"),
      "windows artifact\n",
    ),
  ]);
  const notices = join(root, "THIRD_PARTY_NOTICES.md");
  await writeFile(
    notices,
    "# Third-party notices\n\nBundled runtime notice payload.\n",
  );
  return { artifacts, notices };
}

async function run(
  mode: "generate" | "verify",
  paths: Awaited<ReturnType<typeof fixture>>,
) {
  return execFileAsync(process.execPath, [
    script,
    mode,
    "--artifacts",
    paths.artifacts,
    "--version",
    "0.1.0",
    "--notices",
    paths.notices,
  ]);
}

describe("desktop release metadata", () => {
  it("generates stable unsigned metadata and tracked notices", async () => {
    const paths = await fixture();

    await run("generate", paths);

    const manifestPath = join(
      paths.artifacts,
      "earth-stories-0.1.0-release-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      formatVersion: number;
      version: string;
      releaseReady: boolean;
      manifestSigned: boolean;
      artifacts: Array<{
        name: string;
        platform: string;
        architecture: string;
        size: number;
        sha256: string;
        signed: boolean;
      }>;
      thirdPartyNotices: { name: string; sha256: string };
    };
    expect(manifest).toMatchObject({
      formatVersion: 1,
      version: "0.1.0",
      releaseReady: false,
      manifestSigned: false,
    });
    expect(
      manifest.artifacts.map((artifact) => ({
        name: artifact.name,
        platform: artifact.platform,
        architecture: artifact.architecture,
        signed: artifact.signed,
      })),
    ).toEqual([
      {
        name: "earth-stories-0.1.0-linux-amd64.deb",
        platform: "linux",
        architecture: "x64",
        signed: false,
      },
      {
        name: "earth-stories-0.1.0-linux-x86_64.AppImage",
        platform: "linux",
        architecture: "x64",
        signed: false,
      },
      {
        name: "earth-stories-0.1.0-mac-arm64.dmg",
        platform: "mac",
        architecture: "arm64",
        signed: false,
      },
      {
        name: "earth-stories-0.1.0-win-x64.exe",
        platform: "win",
        architecture: "x64",
        signed: false,
      },
    ]);
    expect(
      manifest.artifacts.every(
        (artifact) =>
          artifact.size > 0 && /^[a-f0-9]{64}$/.test(artifact.sha256),
      ),
    ).toBe(true);
    expect(manifest.thirdPartyNotices.name).toBe(
      "earth-stories-0.1.0-THIRD_PARTY_NOTICES.md",
    );
    expect(
      await readFile(
        join(paths.artifacts, manifest.thirdPartyNotices.name),
        "utf8",
      ),
    ).toContain("Bundled runtime notice payload.");
    const firstManifest = await readFile(manifestPath, "utf8");
    const firstChecksums = await readFile(
      join(paths.artifacts, "earth-stories-0.1.0-SHA256SUMS.txt"),
      "utf8",
    );
    await run("generate", paths);
    expect(await readFile(manifestPath, "utf8")).toBe(firstManifest);
    expect(
      await readFile(
        join(paths.artifacts, "earth-stories-0.1.0-SHA256SUMS.txt"),
        "utf8",
      ),
    ).toBe(firstChecksums);
  });

  it("refuses missing and ambiguous artifact sets", async () => {
    const paths = await fixture();
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      [
        "earth-stories-0.1.0-linux-x86_64.AppImage",
        "earth-stories-0.1.0-linux-amd64.deb",
        "earth-stories-0.1.0-mac-arm64.dmg",
        "earth-stories-0.1.0-win-x64.exe",
      ].map((name) => rm(join(paths.artifacts, name))),
    );
    const missing = await run("generate", paths).catch(
      (cause: unknown) => cause as { stderr: string },
    );
    expect(missing.stderr).toContain("No release artifacts found");

    await writeFile(
      join(paths.artifacts, "earth-stories-0.1.0-linux-x86_64.AppImage"),
      "linux artifact\n",
    );
    await writeFile(
      join(paths.artifacts, "earth-stories-0.1.0-linux-x86_64-copy.AppImage"),
      "ambiguous artifact\n",
    );
    const ambiguous = await run("generate", paths).catch(
      (cause: unknown) => cause as { stderr: string },
    );
    expect(ambiguous.stderr).toContain("Unexpected file in artifact directory");
  });

  it.each(["artifact", "manifest", "checksums"] as const)(
    "detects modified %s bytes",
    async (target) => {
      const paths = await fixture();
      await run("generate", paths);
      const targetPath =
        target === "artifact"
          ? join(paths.artifacts, "earth-stories-0.1.0-linux-x86_64.AppImage")
          : target === "manifest"
            ? join(paths.artifacts, "earth-stories-0.1.0-release-manifest.json")
            : join(paths.artifacts, "earth-stories-0.1.0-SHA256SUMS.txt");
      await writeFile(targetPath, `modified ${target}\n`);

      const error = await run("verify", paths).catch(
        (cause: unknown) => cause as { stderr: string },
      );
      expect(error.stderr).toContain("Release metadata verification failed");
    },
  );
});
