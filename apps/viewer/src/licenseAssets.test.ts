import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = resolve("apps/viewer/scripts/stage-license-assets.mjs");

it("stages the bundled font licenses with the offline viewer", async () => {
  const repository = await mkdtemp(
    join(tmpdir(), "earth-stories-viewer-licenses-"),
  );
  const output = join(repository, "dist", "viewer");
  const licenses = {
    "node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE":
      "Plus Jakarta Sans\nSIL OPEN FONT LICENSE Version 1.1\n",
    "node_modules/@fontsource/dm-mono/LICENSE":
      "DM Mono\nSIL OPEN FONT LICENSE Version 1.1\n",
  };
  for (const [relativePath, contents] of Object.entries(licenses)) {
    const path = join(repository, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }

  await execFileAsync(process.execPath, [
    script,
    "--repository",
    repository,
    "--output",
    output,
  ]);

  expect(
    await readFile(join(output, "credits/PLUS_JAKARTA_SANS_LICENSE"), "utf8"),
  ).toBe(
    licenses["node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE"],
  );
  expect(await readFile(join(output, "credits/DM_MONO_LICENSE"), "utf8")).toBe(
    licenses["node_modules/@fontsource/dm-mono/LICENSE"],
  );
});
