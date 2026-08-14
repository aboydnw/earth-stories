import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopDiagnostics } from "./diagnostics.js";

describe("DesktopDiagnostics", () => {
  it("persists and exports only allowlisted lifecycle codes", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-diagnostics-"));
    const diagnostics = new DesktopDiagnostics({
      directory: join(root, "logs"),
      appVersion: "1.2.3",
      platform: "linux",
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });
    const secretFixture = {
      componentCode: "service",
      errorCode: "service-startup",
      lifecycleStage: "startup",
      serviceState: {
        statusCode: "failed",
        ready: false,
        acceptingMutations: false,
        runningConversions: 1,
        runningPublishes: 2,
        path: "/home/anthony/Secret Story",
      },
      token: "ghp_super-secret-token",
      url: "https://example.com/file?X-Amz-Signature=signed-secret",
      message: "The private story says the volcano is unstable.",
      path: "/home/anthony/Secret Story/source.tif",
    };

    await diagnostics.record(secretFixture);
    const persisted = await readFile(diagnostics.path, "utf8");
    const exportedPath = join(root, "earth-stories-diagnostics.json");
    await diagnostics.exportTo(exportedPath);
    const exported = await readFile(exportedPath, "utf8");

    expect(JSON.parse(persisted)).toEqual({
      formatVersion: 1,
      records: [
        {
          componentCode: "service",
          errorCode: "service-startup",
          lifecycleStage: "startup",
          timestamp: "2026-08-13T12:00:00.000Z",
          appVersion: "1.2.3",
          platform: "linux",
          serviceState: {
            statusCode: "failed",
            ready: false,
            acceptingMutations: false,
            runningConversions: 1,
            runningPublishes: 2,
          },
        },
      ],
    });
    expect(exported).toBe(persisted);
    for (const forbidden of [
      "ghp_super-secret-token",
      "X-Amz-Signature",
      "private story",
      "/home/anthony",
      "source.tif",
    ]) {
      expect(persisted).not.toContain(forbidden);
      expect(exported).not.toContain(forbidden);
    }
  });

  it("bounds retained records by age and count", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-diagnostics-"));
    let now = new Date("2026-08-01T00:00:00.000Z");
    const diagnostics = new DesktopDiagnostics({
      directory: root,
      appVersion: "1.2.3",
      platform: "darwin",
      now: () => now,
      maxRecords: 2,
      maxAgeMs: 24 * 60 * 60 * 1_000,
    });
    const record = (errorCode: string) =>
      diagnostics.record({
        componentCode: "main",
        errorCode,
        lifecycleStage: "startup",
      });

    await record("none");
    now = new Date("2026-08-03T00:00:00.000Z");
    await record("unexpected");
    now = new Date("2026-08-03T00:01:00.000Z");
    await record("service-startup");
    now = new Date("2026-08-03T00:02:00.000Z");
    await record("workspace-invalid");

    const persisted = JSON.parse(await readFile(diagnostics.path, "utf8")) as {
      records: Array<{ errorCode: string }>;
    };
    expect(persisted.records.map((entry) => entry.errorCode)).toEqual([
      "service-startup",
      "workspace-invalid",
    ]);
    expect(
      (await readdir(root)).filter((name) => name.includes(".tmp")),
    ).toEqual([]);
  });

  it("serializes concurrent records without losing lifecycle events", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-diagnostics-"));
    const diagnostics = new DesktopDiagnostics({
      directory: root,
      appVersion: "1.2.3",
      platform: "linux",
      maxRecords: 10,
    });

    await Promise.all(
      ["none", "unexpected", "service-startup"].map((errorCode) =>
        diagnostics.record({
          componentCode: "main",
          errorCode,
          lifecycleStage: "startup",
        }),
      ),
    );

    const persisted = JSON.parse(await readFile(diagnostics.path, "utf8")) as {
      records: Array<{ errorCode: string }>;
    };
    expect(persisted.records.map((entry) => entry.errorCode)).toEqual([
      "none",
      "unexpected",
      "service-startup",
    ]);
  });

  it("rejects invalid codes before creating a diagnostics artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "earth-stories-diagnostics-"));
    const diagnostics = new DesktopDiagnostics({
      directory: root,
      appVersion: "1.2.3",
      platform: "win32",
    });

    await expect(
      diagnostics.record({
        componentCode: "filesystem",
        errorCode: "raw-path-leak",
        lifecycleStage: "unknown",
      }),
    ).rejects.toThrow("Invalid diagnostic component code");
    await expect(readdir(root)).resolves.toEqual([]);
  });
});
