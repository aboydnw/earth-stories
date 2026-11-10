import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  checkMacSigningEnvironment,
  inspectMacSignature,
  verifyMacBundle,
  verifyMacBundles,
} from "./macos-release.mjs";

const env = {
  CSC_LINK: "private-certificate-value",
  CSC_KEY_PASSWORD: "private-certificate-password",
  APPLE_ID: "private-apple-account",
  APPLE_APP_SPECIFIC_PASSWORD: "private-notary-password",
  APPLE_TEAM_ID: "A1B2C3D4E5",
};
const signature = [
  "Identifier=org.earthstories.desktop",
  "CodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=1+7 location=embedded",
  "Authority=Developer ID Application: Example (A1B2C3D4E5)",
  "Authority=Developer ID Certification Authority",
  "TeamIdentifier=A1B2C3D4E5",
  `CDHash=${"a".repeat(40)}`,
].join("\n");
const bundle = {
  appPath: "/private/build/mac-arm64/earth-stories.app",
  architecture: "arm64",
  teamId: env.APPLE_TEAM_ID,
};
function commandRunner() {
  return vi.fn(async (command, args) => ({
    stdout: command.endsWith("lipo")
      ? args[1].includes("mac-arm64")
        ? "arm64\n"
        : "x86_64\n"
      : "",
    stderr:
      command.endsWith("codesign") && args[0] === "--display" ? signature : "",
  }));
}

describe("macOS signing preflight", () => {
  it("requires every configured signing input without exposing their values", () => {
    expect(checkMacSigningEnvironment(env, "darwin")).toEqual([]);
    for (const name of Object.keys(env)) {
      const failures = checkMacSigningEnvironment(
        { ...env, [name]: " " },
        "darwin",
      );
      expect(failures).toContain(`Missing ${name}`);
      for (const secret of Object.values(env))
        expect(failures.join()).not.toContain(secret);
    }
  });
  it("rejects non-macOS hosts, malformed teams and disabled discovery", () => {
    expect(
      checkMacSigningEnvironment(
        { ...env, APPLE_TEAM_ID: "bad", CSC_IDENTITY_AUTO_DISCOVERY: "false" },
        "linux",
      ),
    ).toHaveLength(3);
  });
});

describe("macOS bundle trust verification", () => {
  it("checks both architectures using Apple tools and limits the evidence claim", async () => {
    const run = commandRunner();
    const result = await verifyMacBundles({
      artifactRoot: "/private/build",
      teamId: env.APPLE_TEAM_ID,
      run,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.scope).toBe("unpacked-macos-application-bundles");
    expect(result.bundles.map((item) => item.architecture)).toEqual([
      "arm64",
      "x64",
    ]);
    expect(
      result.bundles.every((item) => item.stapledTicket === "passed"),
    ).toBe(true);
    expect(result.notChecked).toContain("installer-and-archive-payloads");
    expect(JSON.stringify(result)).not.toContain("/private");
    expect(run.mock.calls.map(([command, args]) => [command, args[0]])).toEqual(
      [
        ["/usr/bin/codesign", "--verify"],
        ["/usr/bin/codesign", "--display"],
        ["/usr/bin/lipo", "-archs"],
        ["/usr/sbin/spctl", "--assess"],
        ["/usr/bin/xcrun", "stapler"],
        ["/usr/bin/codesign", "--verify"],
        ["/usr/bin/codesign", "--display"],
        ["/usr/bin/lipo", "-archs"],
        ["/usr/sbin/spctl", "--assess"],
        ["/usr/bin/xcrun", "stapler"],
      ],
    );
    expect(run.mock.calls[0][1]).toContain("--strict");
    expect(run.mock.calls[0][1]).toContain("--deep");
    expect(run.mock.calls[4][1][1]).toBe("validate");
  });
  it.each([
    [
      "wrong app",
      signature.replace("org.earthstories.desktop", "org.other.app"),
    ],
    [
      "wrong team",
      signature.replace(
        "TeamIdentifier=A1B2C3D4E5",
        "TeamIdentifier=Z9Y8X7W6V5",
      ),
    ],
    ["ad-hoc", signature.replace(/^Authority=.*$/gm, "")],
    [
      "development certificate",
      signature.replace("Developer ID Application:", "Apple Development:"),
    ],
    ["no hardened runtime", signature.replace("0x10000(runtime)", "0x0(none)")],
    ["missing hash", signature.replace(/^CDHash=.*$/m, "")],
  ])("rejects %s signatures", (_label, output) => {
    expect(() => inspectMacSignature(output, env.APPLE_TEAM_ID)).toThrow();
  });
  it.each([0, 1, 2, 3, 4])(
    "stops when Apple command %i fails",
    async (index) => {
      const success = commandRunner();
      let call = 0;
      const run = vi.fn(async (...args) => {
        if (call++ === index) throw new Error("private-tool-error");
        return success(...args);
      });
      await expect(verifyMacBundle({ ...bundle, run })).rejects.toThrow(
        "failed for earth-stories.app (arm64)",
      );
      expect(run).toHaveBeenCalledTimes(index + 1);
    },
  );
  it("rejects an architecture mismatch before assessing trust", async () => {
    const success = commandRunner();
    const run = vi.fn(async (command, args, options) =>
      command.endsWith("lipo")
        ? { stdout: "x86_64\n", stderr: "" }
        : success(command, args, options),
    );
    await expect(verifyMacBundle({ ...bundle, run })).rejects.toThrow(
      "Unexpected executable architecture",
    );
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("does not return partial evidence when the second bundle fails", async () => {
    const success = commandRunner();
    const run = vi.fn(async (command, args, options) => {
      if (args.some((arg) => arg.includes("/mac/")))
        throw new Error("missing x64");
      return success(command, args, options);
    });
    await expect(
      verifyMacBundles({
        artifactRoot: "/private/build",
        teamId: env.APPLE_TEAM_ID,
        run,
      }),
    ).rejects.toThrow();
  });
  it("keeps unsigned packaging separate and forces signing before verification", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(packageJson.scripts["package:mac"]).toContain(
      "CSC_IDENTITY_AUTO_DISCOVERY=false",
    );
    expect(packageJson.scripts["package:mac:signed"]).toBe(
      "yarn release:mac:preflight && yarn package:prepare && electron-builder --config electron-builder.yml --mac -c.forceCodeSigning=true && yarn release:mac:verify",
    );
  });
});

describe("macOS trust evidence invalidation", () => {
  it.each(["preflight", "verify", "reset"])(
    "removes an old report before %s, including invalid inputs",
    async (mode) => {
      const root = await mkdtemp(join(tmpdir(), "earth-macos-evidence-"));
      const output = join(root, "build/artifacts/macos-trust-evidence.v1.json");
      try {
        await mkdir(join(root, "build/artifacts"), { recursive: true });
        await writeFile(output, '{"bundles":[{"signature":"passed"}]}');
        const execution = promisify(execFile)(
          process.execPath,
          [
            fileURLToPath(new URL("./macos-release.mjs", import.meta.url)),
            mode,
          ],
          { cwd: root, env: { PATH: process.env.PATH } },
        );
        if (mode === "reset") await execution;
        else await expect(execution).rejects.toThrow();
        await expect(readFile(output)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it("invalidates signed evidence before an unsigned build too", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(packageJson.scripts["package:mac"]).toMatch(
      /^node scripts\/macos-release\.mjs reset && yarn package:prepare/,
    );
  });
});

describe("macOS packaging paths", () => {
  it("verifies the actual executableName-derived app name in both CI targets", async () => {
    const config = await readFile(
      new URL("../electron-builder.yml", import.meta.url),
      "utf8",
    );
    const workflow = await readFile(
      new URL(
        "../../../.github/workflows/desktop-artifacts.yml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(config).toMatch(/mac:\n  executableName: earth-stories\n/);
    for (const directory of ["mac-arm64", "mac"]) {
      expect(workflow).toContain(
        `build/artifacts/${directory}/earth-stories.app/Contents/Resources`,
      );
    }
    const run = commandRunner();
    await verifyMacBundles({
      artifactRoot: "/build",
      teamId: env.APPLE_TEAM_ID,
      run,
    });
    expect(run.mock.calls[0][1].at(-1)).toBe(
      "/build/mac-arm64/earth-stories.app",
    );
    expect(run.mock.calls[5][1].at(-1)).toBe("/build/mac/earth-stories.app");
  });
});
