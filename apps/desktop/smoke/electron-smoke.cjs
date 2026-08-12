const { randomUUID } = require("node:crypto");
const { createServer } = require("node:http");
const { resolve } = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const token = `smoke-${randomUUID()}`;
let serviceAuthorization = null;
let maliciousAuthorization = null;

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        rejectListen(new Error("Smoke listener did not bind."));
      else
        resolveListen({
          server,
          origin: `http://127.0.0.1:${address.port}`,
        });
    });
  });
}

async function close(server) {
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}

app
  .whenReady()
  .then(async () => {
    const service = await listen((request, response) => {
      serviceAuthorization = request.headers.authorization ?? null;
      response.setHeader("content-type", "text/html");
      response.end(
        "<!doctype html><title>Earth Stories smoke</title><body>ready</body>",
      );
    });
    const malicious = await listen((request, response) => {
      maliciousAuthorization = request.headers.authorization ?? null;
      response.end("ok");
    });
    const partition = `earth-stories-smoke-${randomUUID()}`;
    const desktopSession = session.fromPartition(partition);
    desktopSession.webRequest.onBeforeSendHeaders(
      { urls: [`${service.origin}/*`] },
      (details, callback) => {
        const headers = { ...details.requestHeaders };
        if (new URL(details.url).origin === service.origin)
          headers.Authorization = `Bearer ${token}`;
        callback({ requestHeaders: headers });
      },
    );
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: resolve(__dirname, "../dist/preload.cjs"),
        session: desktopSession,
      },
    });
    try {
      await desktopSession.fetch(`${service.origin}/health`);
      await desktopSession.fetch(`${malicious.origin}/steal`);
      await window.loadURL(service.origin);
      const renderer = await window.webContents.executeJavaScript(`({
      bridgeKeys: Object.keys(window.earthStoriesDesktop || {}).sort(),
      title: document.title,
      url: location.href,
      local: Object.values(localStorage),
      session: Object.values(sessionStorage)
    })`);
      const serviceAuthenticated = serviceAuthorization === `Bearer ${token}`;
      const result = {
        bridgeKeys: renderer.bridgeKeys,
        hardened: {
          contextIsolation:
            window.webContents.getLastWebPreferences().contextIsolation,
          sandbox: window.webContents.getLastWebPreferences().sandbox,
          nodeIntegration:
            window.webContents.getLastWebPreferences().nodeIntegration,
        },
        partition,
        storagePath: desktopSession.storagePath ?? null,
        serviceAuthenticated,
        maliciousTokenAbsent: maliciousAuthorization === null,
        tokenContained:
          !renderer.title.includes(token) &&
          !renderer.url.includes(token) &&
          !renderer.local.includes(token) &&
          !renderer.session.includes(token),
      };
      const expectedKeys = [
        "chooseWorkspace",
        "openExternal",
        "platform",
        "showProjectFolder",
        "version",
      ];
      if (
        JSON.stringify(result.bridgeKeys) !== JSON.stringify(expectedKeys) ||
        !result.serviceAuthenticated ||
        !result.maliciousTokenAbsent ||
        partition.startsWith("persist:") ||
        result.storagePath !== null ||
        !result.tokenContained ||
        !result.hardened.contextIsolation ||
        !result.hardened.sandbox ||
        result.hardened.nodeIntegration
      )
        throw new Error(`Electron smoke failed: ${JSON.stringify(result)}`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
      window.destroy();
      await Promise.all([close(service.server), close(malicious.server)]);
      app.quit();
    }
  })
  .catch((cause) => {
    process.stderr.write(`${cause.stack ?? cause}\n`);
    app.exit(1);
  });
