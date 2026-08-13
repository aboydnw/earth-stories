export interface DesktopWindowOptionsInput {
  dimensions: { width: number; height: number };
  preloadPath: string;
  session: unknown;
}

export function createDesktopWindowOptions({
  dimensions,
  preloadPath,
  session,
}: DesktopWindowOptionsInput) {
  return {
    ...dimensions,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      session,
    },
  };
}

type ResponseHeaders = Record<string, string[]>;

export interface DesktopSessionPolicyTarget {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (webContents: unknown, permission: string) => boolean,
  ): void;
  webRequest: {
    onHeadersReceived(
      filter: { urls: string[] },
      handler: (
        details: { responseHeaders?: ResponseHeaders },
        callback: (response: { responseHeaders: ResponseHeaders }) => void,
      ) => void,
    ): void;
  };
}

function contentSecurityPolicy(origin: string): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origin} https:`,
    `img-src 'self' ${origin} https: data:`,
    "font-src 'self' https: data:",
    "worker-src 'self' blob:",
    "child-src 'none'",
  ].join("; ");
}

export function installDesktopSessionPolicies(
  session: DesktopSessionPolicyTarget,
  origin: string,
): void {
  session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onHeadersReceived(
    { urls: [`${origin}/*`] },
    (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders ?? {}) };
      for (const name of Object.keys(responseHeaders))
        if (name.toLowerCase() === "content-security-policy")
          delete responseHeaders[name];
      responseHeaders["Content-Security-Policy"] = [
        contentSecurityPolicy(origin),
      ];
      callback({ responseHeaders });
    },
  );
}

export interface DesktopNavigationTarget {
  on(
    event: "will-navigate",
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): void;
  setWindowOpenHandler(
    handler: (details: { url: string }) => { action: "allow" | "deny" },
  ): void;
}

export interface DesktopNavigationOptions {
  origin: string | (() => string);
  openExternal(url: string): Promise<void>;
}

function parsedExternalUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isServiceUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function openApprovedExternal(
  url: string,
  openExternal: (url: string) => Promise<void>,
): void {
  const parsed = parsedExternalUrl(url);
  if (parsed)
    void openExternal(parsed.href).catch(() => {
      // Navigation stays denied even if the operating system cannot open it.
    });
}

export function installNavigationPolicy(
  target: DesktopNavigationTarget,
  options: DesktopNavigationOptions,
): void {
  target.on("will-navigate", (event, url) => {
    const origin =
      typeof options.origin === "function" ? options.origin() : options.origin;
    if (isServiceUrl(url, origin)) return;
    event.preventDefault();
    openApprovedExternal(url, options.openExternal);
  });
  target.setWindowOpenHandler(({ url }) => {
    const origin =
      typeof options.origin === "function" ? options.origin() : options.origin;
    if (!isServiceUrl(url, origin))
      openApprovedExternal(url, options.openExternal);
    return { action: "deny" };
  });
}
