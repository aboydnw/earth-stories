import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

const pixi = resolve(
  process.argv[2] ??
    (platform() === "win32"
      ? ".earth-stories/bin/pixi.exe"
      : ".earth-stories/bin/pixi"),
);

await new Promise((resolveCheck, rejectCheck) => {
  const child = spawn(pixi, ["lock", "--check"], { stdio: "inherit" });
  child.once("error", rejectCheck);
  child.once("exit", (code) =>
    code === 0
      ? resolveCheck()
      : rejectCheck(new Error(`Pixi lock check failed with exit ${code}`)),
  );
});
