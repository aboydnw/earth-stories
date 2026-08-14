import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesktopPaths } from "./paths.js";

describe("resolveDesktopPaths", () => {
  it.each([
    {
      name: "development",
      input: {
        isPackaged: false,
        applicationDirectory: "/repo/apps/desktop",
        resourcesDirectory: "/unused/resources",
        userDataDirectory: "/profile",
        documentsDirectory: "/documents",
        platform: "linux" as const,
      },
      resourceRoot: "/repo",
    },
    {
      name: "packaged",
      input: {
        isPackaged: true,
        applicationDirectory: "/installed/app",
        resourcesDirectory: "/installed/resources",
        userDataDirectory: "/profile",
        documentsDirectory: "/documents",
        platform: "linux" as const,
      },
      resourceRoot: "/installed/resources",
    },
  ])(
    "resolves $name resources through the same interface",
    ({ name, input, resourceRoot }) => {
      expect(resolveDesktopPaths(input)).toEqual({
        serviceBundle: posix.join(
          resourceRoot,
          name === "packaged"
            ? "service/service.js"
            : "apps/local-service/dist/service.js",
        ),
        viewerDirectory: posix.join(
          resourceRoot,
          name === "packaged" ? "viewer" : "dist/viewer",
        ),
        editorDirectory: posix.join(
          resourceRoot,
          name === "packaged" ? "editor" : "dist/editor",
        ),
        conversionManifestDirectory:
          name === "packaged"
            ? posix.join(resourceRoot, "conversion")
            : resourceRoot,
        conversionWorkerDirectory: posix.join(
          resourceRoot,
          "conversion/worker",
        ),
        projectsDirectory: posix.join("/documents", "Earth Stories"),
        userDataDirectory: "/profile",
        toolsDirectory: posix.join("/profile", "tools"),
        logsDirectory: posix.join("/profile", "logs"),
        credentialsFile: posix.join("/profile", "credentials.json"),
        workspacePointerFile: posix.join("/profile", "workspace.json"),
        windowPreferencesFile: posix.join("/profile", "window.json"),
        pixiExecutable: posix.join("/profile", "tools", "bin", "pixi"),
        pixiHome: posix.join("/profile", "tools", "pixi-home"),
      });
    },
  );

  it("uses the Windows Pixi executable name", () => {
    const paths = resolveDesktopPaths({
      isPackaged: true,
      applicationDirectory: "C:\\installed\\app",
      resourcesDirectory: "C:\\installed\\resources",
      userDataDirectory: "C:\\profile",
      documentsDirectory: "C:\\documents",
      platform: "win32",
    });

    expect(paths.pixiExecutable).toBe("C:\\profile\\tools\\bin\\pixi.exe");
  });
});
