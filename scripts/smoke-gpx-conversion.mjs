import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pixi = resolve(
  process.platform === "win32"
    ? ".earth-stories/bin/pixi.exe"
    : ".earth-stories/bin/pixi",
);
const fixture = resolve("conversion/fixtures/walk.gpx");
const temporary = await mkdtemp(join(tmpdir(), "earth-stories-gpx-"));
const output = join(temporary, "walk.trajectory.json");
const request = {
  protocol: "earth-stories/conversion/v1",
  requestId: "windows-gpx-smoke",
  projectId: "ci-smoke",
  operation: "prepare",
  capability: "vector",
  input: {
    path: fixture,
    filename: "walk.gpx",
    sizeBytes: (await stat(fixture)).size,
    mediaType: "application/gpx+xml",
  },
  options: { target: "trajectory", outputPath: output },
};

try {
  const stdout = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      pixi,
      [
        "run",
        "--manifest-path",
        resolve("pixi.toml"),
        "-e",
        "vector",
        "python",
        resolve("conversion/worker/worker.py"),
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    let value = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (value += chunk));
    child.once("error", rejectRun);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun(value)
        : rejectRun(new Error(`GPX conversion exited with status ${code}`)),
    );
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
  const events = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!events.some((event) => event.type === "result"))
    throw new Error("GPX conversion did not emit a result event");
  const trajectory = JSON.parse(await readFile(output, "utf8"));
  if (
    !Array.isArray(trajectory.tracks) ||
    trajectory.tracks.length !== 1 ||
    trajectory.tracks[0].path.length !== 3 ||
    trajectory.tracks[0].timestamps.length !== 3
  )
    throw new Error("GPX conversion produced an invalid trajectory sidecar");
  process.stdout.write("GPX trajectory conversion succeeded.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
