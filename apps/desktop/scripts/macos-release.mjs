import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const signingVariables = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

export function checkMacSigningEnvironment(env, platform = process.platform) {
  const failures = [];
  if (platform !== "darwin") failures.push("macOS is required");
  for (const name of signingVariables) {
    if (typeof env[name] !== "string" || !env[name].trim())
      failures.push(`Missing ${name}`);
  }
  if (env.APPLE_TEAM_ID && !/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID))
    failures.push("APPLE_TEAM_ID must be a 10-character Apple team identifier");
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === "false")
    failures.push("CSC_IDENTITY_AUTO_DISCOVERY must not disable signing");
  // Report variable names and failures only, never credential values.
  return failures;
}

export function inspectMacSignature(output, teamId) {
  const identifier = output.match(/^Identifier=(.+)$/m)?.[1];
  const team = output.match(/^TeamIdentifier=(.+)$/m)?.[1];
  const cdHash = output.match(/^CDHash=([a-f0-9]{40,64})$/m)?.[1];
  if (identifier !== "org.earthstories.desktop")
    throw new Error("Unexpected macOS application identifier");
  if (!/^[A-Z0-9]{10}$/.test(teamId) || team !== teamId)
    throw new Error("macOS signature does not match the expected Apple team");
  if (!/^Authority=Developer ID Application: .+$/m.test(output))
    throw new Error("A Developer ID Application signature is required");
  if (
    !/^CodeDirectory .*flags=0x[\da-f]+\([^\n)]*\bruntime\b[^\n)]*\)/m.test(
      output,
    )
  )
    throw new Error("The macOS signature must enable hardened runtime");
  if (!cdHash) throw new Error("Missing macOS CodeDirectory hash");
  return { identifier, teamId: team, codeDirectoryHash: cdHash };
}

export async function verifyMacBundle({
  appPath,
  architecture,
  teamId,
  run = execFileAsync,
}) {
  const execute = async (command, args) => {
    try {
      return await run(command, args, {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      });
    } catch {
      throw new Error(
        `${basename(command)} failed for ${basename(appPath)} (${architecture})`,
      );
    }
  };
  await execute("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);
  const signature = await execute("/usr/bin/codesign", [
    "--display",
    "--verbose=4",
    appPath,
  ]);
  const identity = inspectMacSignature(
    `${signature.stdout}\n${signature.stderr}`,
    teamId,
  );
  const binary = await execute("/usr/bin/lipo", [
    "-archs",
    join(appPath, "Contents/MacOS/earth-stories"),
  ]);
  const expectedArchitecture = architecture === "x64" ? "x86_64" : architecture;
  if (
    !["arm64", "x64"].includes(architecture) ||
    binary.stdout.trim() !== expectedArchitecture
  )
    throw new Error(`Unexpected executable architecture for ${architecture}`);
  await execute("/usr/sbin/spctl", [
    "--assess",
    "--type",
    "execute",
    "--verbose=4",
    appPath,
  ]);
  await execute("/usr/bin/xcrun", ["stapler", "validate", appPath]);
  return {
    bundle: basename(appPath),
    architecture,
    ...identity,
    signature: "passed",
    gatekeeperAssessment: "passed",
    stapledTicket: "passed",
  };
}

export async function verifyMacBundles({ artifactRoot, teamId, run }) {
  const bundles = [];
  for (const [directory, architecture] of [
    ["mac-arm64", "arm64"],
    ["mac", "x64"],
  ]) {
    bundles.push(
      await verifyMacBundle({
        appPath: join(artifactRoot, directory, "earth-stories.app"),
        architecture,
        teamId,
        run,
      }),
    );
  }
  return {
    formatVersion: 1,
    checkedAt: new Date().toISOString(),
    scope: "unpacked-macos-application-bundles",
    releaseReady: false,
    bundles,
    notChecked: [
      "installer-and-archive-payloads",
      "browser-quarantine-first-launch",
      "clean-machine-authoring",
      "conversion-runtime",
      "upgrade-rollback-uninstall",
      "licensing",
      "release-approval",
    ],
  };
}

async function main() {
  const mode = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !["preflight", "verify", "reset"].includes(mode)
  )
    throw new Error(
      "Usage: node scripts/macos-release.mjs <preflight|verify|reset>",
    );
  const artifactRoot = resolve("build/artifacts");
  const output = join(artifactRoot, "macos-trust-evidence.v1.json");
  // Invalidate evidence before any new signed/unsigned attempt or verification,
  // including failed input checks and failures before the verification stage.
  await rm(output, { force: true });
  if (mode === "reset") return;
  if (mode === "preflight") {
    const failures = checkMacSigningEnvironment(process.env);
    if (failures.length) throw new Error(failures.join("; "));
    process.stdout.write(
      "macOS signing inputs are present; credentials and signing are not yet verified.\n",
    );
    return;
  }
  if (process.platform !== "darwin") throw new Error("macOS is required");
  if (!/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID ?? ""))
    throw new Error("Set the expected APPLE_TEAM_ID before verifying");
  const report = await verifyMacBundles({
    artifactRoot,
    teamId: process.env.APPLE_TEAM_ID,
  });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
