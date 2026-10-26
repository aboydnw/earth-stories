import { describe, expect, it } from "vitest";
import type { DesktopBridge } from "../desktop";
import { detectAuthoringRuntime } from "./detect";

const desktop = { version: "1.0.0" } as DesktopBridge;

describe("detectAuthoringRuntime", () => {
  it("uses the desktop capabilities when preload exposes the bridge", () => {
    expect(
      detectAuthoringRuntime({
        location: new URL("http://127.0.0.1:4317/"),
        earthStoriesDesktop: desktop,
      }),
    ).toMatchObject({
      kind: "desktop",
      desktop,
      capabilities: {
        projectWorkspace: true,
        nativeConversion: true,
        protectedCredentials: true,
      },
    });
  });

  it.each(["http://127.0.0.1:5173/", "http://localhost:5173/"])(
    "recognizes the local browser development runtime at %s",
    (href) => {
      expect(
        detectAuthoringRuntime({ location: new URL(href) }),
      ).toMatchObject({
        kind: "development-loopback",
        desktop: null,
        capabilities: { projectWorkspace: true, nativeConversion: true },
      });
    },
  );

  it("does not imply local authoring on a hosted origin", () => {
    expect(
      detectAuthoringRuntime({
        location: new URL("https://stories.example.org/editor/"),
      }),
    ).toEqual({
      kind: "hosted-browser",
      desktop: null,
      capabilities: {
        projectWorkspace: false,
        nativeConversion: false,
        protectedCredentials: false,
        folderPublication: false,
        githubPagesPublishing: false,
        nativeDialogs: false,
      },
    });
  });
});
