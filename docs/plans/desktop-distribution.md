# Implementation plan: installable desktop application

Status: proposed

Priority: high adoption value after core local workflows stabilize

Depends on: current local service; integrates later with `.earthstory` handoff

## Outcome

Ship Earth Stories as a signed desktop application for supported macOS, Windows
x64, and Linux systems. A non-developer can install it, choose a visible local
workspace, create or open stories, prepare data, preview, and publish without
installing Node.js, Corepack, Yarn, GDAL, or PDAL manually.

The desktop shell preserves the current product boundary: projects remain
ordinary user-owned folders, the editor remains a browser application, the
authoritative viewer remains shared with publications, and the local service
retains all filesystem authority.

## Scope

The first desktop release includes:

- an Electron shell around the production editor and local service;
- a user-visible, selectable projects directory;
- lifecycle management for the loopback service and conversion worker;
- platform installers, signing/notarization, and release checksums;
- first-run diagnostics and migration guidance for clone-and-run users;
- manual application updates for the pilot;
- the same lazy, disclosed Pixi capability provisioning used today.

Electron is chosen for the pilot because the application already depends on a
Node local service and browser runtime. Tauri would either ship a Node sidecar
or require an early service rewrite in Rust, adding risk without improving the
author workflow being validated. Revisit shell size and long-term maintenance
after pilot evidence, not during initial packaging.

The initial installer is not a promise of first-run offline conversion. Pixi
and its capability environments are still downloaded lazily unless a later
“full offline tools” installer is deliberately produced. The app must disclose
that boundary before a download.

## Architectural decisions

### 1. Keep the desktop shell thin

Add `apps/desktop` with an Electron main process and minimal preload bridge. It
owns windows, app lifecycle, native file/folder dialogs, single-instance
behavior, OS file associations, and starting/stopping the local service. It
does not read or write project files directly.

The React editor continues to call the same local HTTP API. Development keeps
Vite at `:5173`; packaged production serves the built editor and API from one
random loopback origin.

### 2. Make the local service embeddable

The current `apps/local-service/src/server.ts` exports `createLocalServer` but
also starts a process at module load. Split it into:

```text
server.ts       request handling and createLocalServer(options)
standalone.ts   current CLI/dev entrypoint
runtime.ts      start/stop helper used by Electron
```

Allow port `0` so the OS allocates an available port. Return the actual origin,
ready state, projects directory, and an idempotent async close function. Pass
all resource paths explicitly instead of deriving production locations from
the source tree.

### 3. Serve production UI and API from one protected origin

In packaged mode the service serves `dist/editor` at `/` and API/assets on the
same origin. This avoids `file://` behavior, preserves relative fetches, and
supports browser security and byte-range requests.

Origin checks alone are not sufficient authentication for a long-lived desktop
service. Generate a random per-launch capability in the main process and keep it
outside URLs, renderer JavaScript, storage, logs, and crash reports. Use a
dedicated in-memory Electron session whose `webRequest` hook adds the capability
as an authorization header only for the exact loopback service origin, including
its allocated port. The service rejects every packaged-mode request without that
header; a listener on another loopback port must never receive or replay it.
Mutating APIs require the capability plus the existing trusted-origin checks.

Bind only to `127.0.0.1`, never all interfaces. Dev standalone mode retains its
current unauthenticated behavior only behind an explicit configuration option,
and packaged mode fails closed if that option is enabled. Add tests for token
absence from URLs/logs/storage and for a malicious listener on another loopback
port.

### 4. Preserve visible user ownership

Default the first workspace to an `Earth Stories` folder under the user's
Documents directory, after showing the location. Let the author choose another
folder with a native dialog. Store only the chosen workspace pointer and shell
preferences in Electron's application-data directory.

Do not move existing projects automatically. On first launch, offer to choose
the existing `earth-stories-projects` parent folder or start a new workspace.
Changing workspace uses the same lifecycle protocol as application quit: stop
accepting mutations, resolve unsaved edits, drain active conversion and
publication work, request cooperative cancellation for remaining jobs, and only
then restart or terminate the service. Jobs write to temporary paths and
atomically promote completed outputs; persisted job state lets the next launch
remove or recover interrupted work without exposing partial results.

### 5. Package runtime resources explicitly

Place these below Electron's read-only `resources` directory, outside ASAR when
they must be executed or read by native tools:

- built editor and viewer assets;
- local service code and production Node dependencies;
- conversion worker, JSON Schema, `pixi.toml`, and platform lock data;
- checksum/version tables and tool credits;
- the platform-specific checksum-verified Pixi bootstrap executable if its
  redistribution terms permit bundling.

Put mutable downloads and environments under an application cache/tools
directory, not inside the install location or project. Project inputs and
prepared outputs remain inside the selected project folder.

If Pixi cannot be redistributed, package the checksum-verified bootstrap logic
and make the first capability download explicit. Do not fetch executable code
silently on application launch.

### 6. Harden the Electron renderer

Use `contextIsolation: true`, renderer sandboxing, `nodeIntegration: false`, a
strict Content Security Policy, no remote module, permission-deny defaults, and
navigation/window-open handlers that send approved HTTP(S) links to the system
browser. The preload exposes only narrow methods such as choose-workspace,
show-project-folder, application version, and platform—not generic filesystem
or shell execution.

Screen-feedback recording remains a development-only feature and is not
included in production installers unless a later consent/review decision adds
it.

### 7. Start with controlled manual updates

For the pilot, publish signed versioned installers, SHA-256 checksums, release
notes, and rollback/download instructions. Add an optional “Check for updates”
link, but do not introduce an always-on updater before signing, hosting,
rollback, and privacy behavior are owned operationally.

The project format remains independently readable, so declining an update
never locks authors out of their files.

## Implementation phases

### Phase 0 — Packaging spike and decision record

- Build an unsigned internal Electron package on macOS, Windows x64, and Linux.
- Start the embedded service on a random loopback port and complete create,
  save, local asset preview, publication, and one conversion smoke test.
- Measure installer size, cold start, idle memory, viewer performance, and
  shutdown cleanup.
- Prove Pixi execution from the packaged resource layout on every target OS.
- Confirm Electron, Pixi, native dependency, codec, and bundled-tool licenses.
- Record the Electron-versus-Tauri decision and exit conditions in an ADR.

Exit criterion: packaged smoke tests work without Node/Yarn installed on the
test machine.

### Phase 1 — Refactor runtime boundaries

#### `apps/local-service/src/server.ts`

- Remove module-load startup and accept explicit host, port, projects root,
  viewer root, editor root, Pixi path, runtime root, and session configuration.
- Add static editor serving with path containment, correct MIME types, SPA
  fallback, cache policy, and byte ranges where appropriate.
- Keep API behavior identical between standalone and desktop modes.

#### `apps/local-service/src/standalone.ts` (new)

- Preserve `yarn dev`, `EARTH_STORIES_PORT`,
  `EARTH_STORIES_PROJECTS_DIR`, and current terminal diagnostics.

#### `apps/local-service/src/runtime.ts` (new)

- Provide typed async start/readiness/close and surface address-in-use,
  permission, missing-viewer, and invalid-workspace failures.

#### Tests

- Assert import has no startup side effects.
- Cover random-port startup, protected bootstrap, session rejection, static SPA
  routes, graceful close, repeated close, and standalone compatibility.

Exit criterion: tests can start multiple isolated service instances in one
process with different temporary workspaces.

### Phase 2 — Electron shell

#### `apps/desktop/package.json` and build configuration

- Add pinned Electron and packaging tooling.
- Define unpacked resources, platform identifiers, icons, app name, version
  source, installer targets, and artifact naming.

#### `apps/desktop/src/main.ts` (new)

- Enforce a single instance and route second-instance/open-file events.
- Resolve resource and mutable cache paths per platform.
- Start the service, exchange the bootstrap session, create the hardened
  BrowserWindow, and show a useful startup-error window if initialization fails.
- Run the shared mutation-stop, drain, cooperative-cancellation, and cleanup
  protocol before quit, with a bounded forced-shutdown fallback that leaves
  recoverable job state rather than partial promoted output.
- Restore window dimensions without persisting story content or URLs.

#### `apps/desktop/src/preload.ts` (new)

- Expose narrow, typed desktop capabilities through `contextBridge`.
- Validate every input in the main process again.

#### `apps/editor/src/desktop.ts` (new)

- Detect optional desktop capabilities without coupling browser builds to
  Electron imports.
- Add **Choose workspace**, **Show project folder**, application version, and
  diagnostic locations where appropriate.

Exit criterion: the same production editor build runs in a normal browser and
Electron, with desktop-only controls progressively enabled.

### Phase 3 — Workspace onboarding and runtime provisioning

- Add first-run selection of default Documents workspace, existing workspace,
  or another folder.
- Validate read/write/rename support before accepting a workspace and explain
  network-mounted-folder caveats.
- Detect an existing clone-and-run workspace only when the user points to it;
  never scan the whole disk.
- Move Pixi download/cache paths to the explicit mutable tools directory.
- Show capability name, pinned tool versions, estimated download size, cache
  location, cancel/retry, and credits before provisioning.
- Add **Prepare for offline work** later as described in the offline plan; do
  not call the base installer offline-capable before those environments exist.

Exit criterion: a fresh non-developer user can locate their workspace and
understand where both projects and downloaded tools live.

### Phase 4 — Platform packaging and CI

#### `.github/workflows/desktop.yml` (new)

- Build from clean macOS arm64/x64, Windows x64, and Linux runners.
- Run unit/type/build gates before packaging.
- Install the produced artifact in a disposable environment and run an
  Electron smoke test against a temporary user workspace.
- Upload unsigned PR artifacts only under an explicit retention policy; sign
  release artifacts from protected release workflows.

#### Release packaging

- macOS: universal or separately labeled arm64/x64 DMG/ZIP, hardened runtime,
  Developer ID signing, and notarization.
- Windows: x64 installer, Authenticode signing, clean uninstall that preserves
  user projects, and SmartScreen validation.
- Linux: choose one primary portable target plus a package target after pilot
  testing; document sandbox and executable-mount limitations.
- Generate checksums, SBOM/third-party notices, and a signed update/release
  manifest even before automatic updates exist.

Exit criterion: each installed artifact starts, edits a fixture, prepares a
small local file, builds a publication, restarts, and reopens the same project.

### Phase 5 — Distribution, support, and handoff integration

- Publish installation, backup, update, rollback, uninstall, and workspace-
  location documentation.
- Ensure uninstall never removes Documents-based workspaces or retained Pixi
  data without a separate explicit cleanup action.
- Add a diagnostics export containing only an allowlisted schema: component and
  error codes, coarse lifecycle stage, timestamps, versions, platform, and
  sanitized service state. Redact values before persistence as well as export;
  omit raw exception messages, paths, URLs and query parameters, credentials,
  request bodies, story prose, and source data by default. Test a fixture whose
  failures contain secrets, story text, and sensitive paths/URLs and prove none
  appear in persisted or exported diagnostics.
- Register `.earthstory` only after the handoff importer is complete and route
  open-file events through its inspect/confirm flow.
- Establish a release owner for certificates, notarization credentials,
  vulnerability response, and supported-version policy.

Exit criterion: the pilot has an owned, repeatable release and support process,
not just locally generated installers.

## Test plan

- Local-service parity tests in standalone and embedded modes.
- Session/bootstrap, navigation, CSP, permission, preload-validation, and
  malicious-local-origin security tests.
- Workspace-change and quit tests during conversion and publication, including
  cooperative cancellation, forced termination, and next-launch recovery.
- Electron lifecycle tests for first/second instance, crash, failed service
  startup, graceful quit, conversion child cleanup, and workspace change.
- Fresh-machine packaged smoke tests with Node, Yarn, GDAL, and PDAL absent.
- Workspace paths containing spaces, Unicode, long names, removable drives,
  read-only folders, and supported network shares.
- Platform conversion smoke tests using the installed application resource
  layout.
- Upgrade and uninstall tests proving project folders remain untouched.
- Accessibility/keyboard tests for first-run and native-dialog return paths.

## Acceptance criteria

- A user can install and run Earth Stories without a developer toolchain.
- Projects live in a visible folder the user chose and survive upgrade or
  uninstall.
- The packaged app retains the loopback-only, validated local-service boundary.
- The renderer has no Node/filesystem capability and external navigation opens
  outside the app.
- Pixi/tool provisioning is pinned, verified, disclosed, retryable, and stored
  outside the application install.
- macOS and Windows release artifacts are signed; supported Linux artifacts
  have checksums and a documented install path.
- Installed-artifact CI covers create, save, reopen, convert, preview, and
  publish on every supported platform.

## Principal risks

- Code signing, notarization, installer reputation, and release hosting are
  operational commitments, not build-script details. Assign owners before
  public distribution.
- Electron increases binary size and security-maintenance load. Keep the shell
  narrow, update supported Electron promptly, and measure actual pilot value.
- Conversion environments are much larger than the app. Lazy provisioning and
  optional offline preparation need honest size disclosure and cache controls.
- Workspace folders on synchronized/network filesystems may weaken atomic-rename
  assumptions. Detect capabilities where possible and document the support
  boundary.
- Bundling executable tooling has license and antivirus implications. Complete
  the Phase 0 redistribution and signing checks before choosing installer
  contents.
