import { join } from "node:path";
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
    ({ input, resourceRoot }) => {
      expect(resolveDesktopPaths(input)).toEqual({
        serviceBundle: join(resourceRoot, "apps/local-service/dist/service.js"),
        viewerDirectory: join(resourceRoot, "dist/viewer"),
        editorDirectory: join(resourceRoot, "dist/editor"),
        conversionManifestDirectory: resourceRoot,
        conversionWorkerDirectory: join(resourceRoot, "conversion/worker"),
        projectsDirectory: join("/documents", "Earth Stories"),
        userDataDirectory: "/profile",
        toolsDirectory: join("/profile", "tools"),
        logsDirectory: join("/profile", "logs"),
        credentialsFile: join("/profile", "credentials.json"),
        workspacePointerFile: join("/profile", "workspace.json"),
        windowPreferencesFile: join("/profile", "window.json"),
        pixiExecutable: join("/profile", "tools", "bin", "pixi"),
        pixiHome: join("/profile", "tools", "pixi-home"),
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
