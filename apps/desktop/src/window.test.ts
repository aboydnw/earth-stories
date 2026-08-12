import { describe, expect, it, vi } from "vitest";
import {
  createDesktopWindowOptions,
  installDesktopSessionPolicies,
  installNavigationPolicy,
} from "./window.js";

describe("desktop window options", () => {
  it("uses the preload in a sandboxed, context-isolated renderer without Node", () => {
    const session = { partition: "desktop" };

    expect(
      createDesktopWindowOptions({
        dimensions: { width: 1280, height: 800 },
        preloadPath: "/application/dist/preload.js",
        session,
      }),
    ).toEqual({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: "/application/dist/preload.js",
        sandbox: true,
        session,
      },
    });
  });
});

describe("desktop session policies", () => {
  function harness() {
    let permissionRequest:
      | ((
          webContents: unknown,
          permission: string,
          callback: (allowed: boolean) => void,
        ) => void)
      | undefined;
    let permissionCheck:
      ((webContents: unknown, permission: string) => boolean) | undefined;
    let headersReceived:
      | ((
          details: { responseHeaders?: Record<string, string[]> },
          callback: (response: {
            responseHeaders: Record<string, string[]>;
          }) => void,
        ) => void)
      | undefined;
    let headerFilter: { urls: string[] } | undefined;
    const session = {
      setPermissionRequestHandler: (handler: typeof permissionRequest) => {
        permissionRequest = handler;
      },
      setPermissionCheckHandler: (handler: typeof permissionCheck) => {
        permissionCheck = handler;
      },
      webRequest: {
        onHeadersReceived: (
          filter: { urls: string[] },
          handler: typeof headersReceived,
        ) => {
          headerFilter = filter;
          headersReceived = handler;
        },
      },
    };
    installDesktopSessionPolicies(session, "http://127.0.0.1:45123");
    return {
      headerFilter: () => headerFilter,
      headersReceived: () => headersReceived,
      permissionCheck: () => permissionCheck,
      permissionRequest: () => permissionRequest,
    };
  }

  it("denies requested and checked permissions by default", () => {
    const value = harness();
    const callback = vi.fn();

    value.permissionRequest()?.({}, "geolocation", callback);

    expect(callback).toHaveBeenCalledWith(false);
    expect(value.permissionCheck()?.({}, "clipboard-read")).toBe(false);
  });

  it("injects CSP only on the exact service-origin URL filter", () => {
    const value = harness();

    expect(value.headerFilter()).toEqual({
      urls: ["http://127.0.0.1:45123/*"],
    });
  });

  it("injects a script-self-only CSP with bounded network and blob resources", () => {
    const value = harness();
    const callback = vi.fn();

    value.headersReceived()?.(
      { responseHeaders: { "X-Frame-Options": ["DENY"] } },
      callback,
    );

    const headers = callback.mock.calls[0]?.[0].responseHeaders as Record<
      string,
      string[]
    >;
    expect(headers["X-Frame-Options"]).toEqual(["DENY"]);
    const directives = Object.fromEntries(
      (headers["Content-Security-Policy"]?.[0] ?? "")
        .split(";")
        .map((directive) => {
          const [name, ...sources] = directive.trim().split(/\s+/);
          return [name, sources.join(" ")];
        }),
    );
    expect(directives).toMatchObject({
      "script-src": "'self'",
      "connect-src": "'self' http://127.0.0.1:45123 https:",
      "img-src": "'self' http://127.0.0.1:45123 https: data:",
      "worker-src": "'self' blob:",
      "child-src": "'none'",
      "object-src": "'none'",
    });
  });
});

describe("desktop navigation policy", () => {
  function harness() {
    let willNavigate:
      ((event: { preventDefault(): void }, url: string) => void) | undefined;
    let openWindow:
      ((details: { url: string }) => { action: "allow" | "deny" }) | undefined;
    const openExternal = vi.fn(async () => undefined);
    installNavigationPolicy(
      {
        on: (_event, listener) => {
          willNavigate = listener;
        },
        setWindowOpenHandler: (handler) => {
          openWindow = handler;
        },
      },
      { origin: "http://127.0.0.1:45123", openExternal },
    );
    return {
      navigate(url: string) {
        const preventDefault = vi.fn();
        willNavigate?.({ preventDefault }, url);
        return preventDefault;
      },
      open(url: string) {
        return openWindow?.({ url });
      },
      openExternal,
    };
  }

  it("allows navigation at the exact service origin", () => {
    const value = harness();

    expect(
      value.navigate("http://127.0.0.1:45123/projects/one"),
    ).not.toHaveBeenCalled();
    expect(value.openExternal).not.toHaveBeenCalled();
  });

  it("denies same-origin popups so no unmanaged child window is created", () => {
    const value = harness();

    expect(value.open("http://127.0.0.1:45123/help")).toEqual({
      action: "deny",
    });
    expect(value.openExternal).not.toHaveBeenCalled();
  });

  it("opens external HTTPS navigation in the system browser without navigating", () => {
    const value = harness();

    expect(value.navigate("https://example.com/help")).toHaveBeenCalledOnce();
    expect(value.openExternal).toHaveBeenCalledWith("https://example.com/help");
  });

  it("opens external HTTP windows in the system browser and denies the window", () => {
    const value = harness();

    expect(value.open("http://example.com/help")).toEqual({ action: "deny" });
    expect(value.openExternal).toHaveBeenCalledWith("http://example.com/help");
  });

  it.each([
    "http://127.0.0.1:45124/steal",
    "file:///documents/Earth%20Stories/project-one/story.json",
    "earth-stories://project/project-one",
    "javascript:alert(1)",
    "not a URL",
  ])("refuses non-web or different-loopback navigation to %s", (url) => {
    const value = harness();

    expect(value.navigate(url)).toHaveBeenCalledOnce();
    if (url.startsWith("http://127.0.0.1:45124"))
      expect(value.openExternal).toHaveBeenCalledWith(url);
    else expect(value.openExternal).not.toHaveBeenCalled();
  });

  it.each([
    "file:///documents/Earth%20Stories/project-one/story.json",
    "earth-stories://project/project-one",
    "javascript:alert(1)",
  ])("denies a non-web window for %s without opening it externally", (url) => {
    const value = harness();

    expect(value.open(url)).toEqual({ action: "deny" });
    expect(value.openExternal).not.toHaveBeenCalled();
  });
});
