# ADR 0002: Desktop shell and packaged conversion runtime

- Status: Provisional — gates open
- Date: 2026-08-12

## Context

Earth Stories needs a desktop shell that can start the local service and run the
pinned Pixi/conda-forge conversion runtime from an installed application. The
packaged application resources must remain immutable, while Pixi's manifest,
lock, environments, and caches live in a writable per-user location.

The desktop packaging spike must answer this on Linux x64, Windows x64, and
macOS, including a notarized hardened-runtime macOS build. It must also measure
the service bundle, installer, runtime behavior, and redistribution licenses.
Executable Linux x64 probes have now covered the Pixi layout and a bundled
local service running in an actual Electron main process. The durable evidence
needed to interpret those probes is retained below; temporary spike files and
raw logs are not dependencies of this ADR.

## Provisional decision

Keep the desktop-shell decision open. The Linux evidence supports continuing
with the copied-manifest Pixi design: exact-version, checksum-verified Pixi can
install locked environments and run the real conversion worker without observed
modification of the modeled packaged resources. A single-file ESM service
bundle also starts and completes the core project API lifecycle in Electron,
but current resource-root assumptions and the absence of editor serving prevent
that bundle from being a package-ready desktop service. The evidence does not
decide Electron versus Tauri and does not satisfy the desktop spike's acceptance
criteria.

Any implementation that advances from this spike must copy and digest-verify
both `pixi.toml` and `pixi.lock`, restore mismatched copies before execution, use
`--manifest-path` and `--locked`, and explicitly place Pixi home and cache data
under the per-user tools directory.

## Linux evidence appendix

### Host, bootstrap, and layout

The probe ran on 2026-08-11 UTC on Linux x86_64, kernel
`6.8.0-136-generic`, in a KVM VM with 8 AMD EPYC-Rome vCPUs and 15 GiB RAM.
Repository `scripts/install-pixi.mjs` installed Pixi 0.76.1 after verifying the
Linux x64 release archive against SHA-256
`8e2ab7630f5bc1e8aa38d236842e20f565f7aa0834687e53670b7c86ba54c90f`.
The installed binary reported `pixi 0.76.1` and had SHA-256
`d14b161c84692dd201848754b4adac5a6f2c8d873e5d7626070f6e8c5176133d`.
The bootstrap pattern was:

```sh
node scripts/install-pixi.mjs ./scratch-userData/tools/pixi-0.76.1
./scratch-userData/tools/pixi-0.76.1 --version
```

The packaged model used `0555` on `packaged-app`, `resources`, and
`resources/conversion`, and `0444` on the two master files. Their SHA-256 values
were:

```text
6041f95c2b745d520d9ee0015cf6f71114013d78a2ebc3a198ba3b1d712a92c7  pixi.toml
f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2  pixi.lock
```

The full lock digest selected the writable copy directory
`scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/`.
The copied files were `0644`; the writable copy directory was observed as
`0700` after the run. Digest and byte checks used:

```sh
sha256sum packaged-app/resources/conversion/{pixi.toml,pixi.lock}
sha256sum scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/{pixi.toml,pixi.lock}
cmp packaged-app/resources/conversion/pixi.toml scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.toml
cmp packaged-app/resources/conversion/pixi.lock scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.lock
```

Replacing the copied manifest with `/bin/true` changed its digest to
`4b5a5694e3c0e8b1d58fc52ac6ef076e55e72c2f53195243ac86d5ff517cc2f6`;
`cmp` exited 1. Recopying both masters restored the expected digests, and both
`cmp` checks returned 0 before use. The same master digests, modes, sizes, and
file set were observed after provisioning and conversion. A final search found
no `.pixi`, temporary lock variant, or temporary file under the packaged
resource directory.

This was a permission-bit model, not a kernel-enforced read-only mount. An
owning process could change `0555`/`0444` with `chmod`. The observed non-mutation
therefore shows Pixi did not write to the packaged directory during this probe;
it does not prove the resource directory was protected from a determined or
faulty owning process.

### Provisioning command patterns

The following patterns preserve the flags and environment differences used in
the probe; paths are shown relative to the temporary spike root:

```sh
PIXI=./scratch-userData/tools/pixi-0.76.1
MANIFEST=./scratch-userData/tools/0.1.0-f722ba4a00333cc8a3d64e4e47523b19e536a7876bde968e225e927097f703b2/pixi.toml

env PIXI_HOME=./scratch-userData/tools/pixi-home \
  /usr/bin/time -f 'CORE wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e core

env PIXI_HOME=./scratch-userData/tools/pixi-home \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache \
  /usr/bin/time -f 'CORE wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e core

env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  /usr/bin/time -f 'RASTER wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" install --manifest-path "$MANIFEST" --locked -e raster
```

In this sandbox, the first command failed at cache acquisition with `no writable
layers to cache package to`. Adding `PIXI_CACHE_DIR` beneath the same scratch
tools tree was the sole configuration change in the second pattern; it moved the
run past cache acquisition to package fetching. Restricted network access then
failed, and the identical command succeeded with approved network access. This
is sandbox-specific evidence, not a general claim that `PIXI_HOME` is ignored by
Pixi on every host.

The successful core install reported 1.40 s wall time, 1.80 s user time, 1.31 s
system time, and 153,508 KiB maximum RSS. Raster used a distinct, initially
absent cache so it did not reuse the measured core cache; it reported 1.81 s
wall time, 3.31 s user time, 2.31 s system time, and 239,412 KiB maximum RSS.

### Size measurement semantics and results

GNU `du -sb ENV CACHE` measured apparent file bytes. `du -sh ENV CACHE` measured
allocated blocks but rounded the display to human-readable units. GNU
`du -sB1 ENV CACHE` measured allocated blocks in one-byte output units. Core's
immediate post-install snapshot used the first two forms; an exact allocated
snapshot was taken only after the import smoke. Raster's immediate post-install
snapshot used `du -sb` and `du -sB1` before fixture generation or conversion.

| Capability and measurement point    | Environment apparent bytes |          Environment allocated | Cache apparent bytes |                Cache allocated |
| ----------------------------------- | -------------------------: | -----------------------------: | -------------------: | -----------------------------: |
| `core`, immediately after install   |                240,122,747 |   245 MiB, rounded by `du -sh` |           81,689,281 |    83 MiB, rounded by `du -sh` |
| `core`, after import smoke          |                240,424,464 | 256,417,792 B, exact `du -sB1` |           81,995,167 |  87,101,440 B, exact `du -sB1` |
| `raster`, immediately after install |                517,467,894 | 548,515,840 B, exact `du -sB1` |          151,494,617 | 167,133,184 B, exact `du -sB1` |

The repository's `CAPABILITY_DOWNLOAD_ESTIMATES` were 45,000,000 B for `core`
and 360,000,000 B for `raster`. Comparing those download-named estimates to the
immediate apparent environment sizes gives 5.34× for core and 1.44× for raster.
That is deliberately not an apples-to-apples transfer comparison: Pixi removed
download archives, network bytes were not captured, and extracted environment
and cache footprints have different semantics. The result supports correcting
installed-disk disclosure, but does not by itself disprove the network-download
estimates.

The unusually short timings must not be generalized to end users. The measured
cache directories were initially absent, but an upstream proxy, VM-image cache,
host filesystem cache, or page cache was not observable or controlled.

### Execution evidence

The locked core smoke used the same manifest and cache variables:

```sh
env PIXI_HOME=./scratch-userData/tools/pixi-home \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e core \
  python -c 'import json,platform,pydantic; print(json.dumps({"python":platform.python_version(),"pydantic":pydantic.__version__},sort_keys=True))'
```

It returned Python 3.12.13 and Pydantic 2.13.4. In the raster environment, the
probe generated a 16×16, 622-byte GeoTIFF and ran the repository worker with a
`prepare` request and a scratch output path:

```sh
env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  /usr/bin/time -f 'CONVERSION wall=%e user=%U sys=%S maxrss_kib=%M exit=%x' \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e raster \
  python conversion/worker/worker.py

env PIXI_HOME=./scratch-userData/tools/pixi-home-raster \
  PIXI_CACHE_DIR=./scratch-userData/tools/pixi-cache-raster \
  "$PIXI" run --manifest-path "$MANIFEST" --locked -e raster \
  rio cogeo validate ./output/tiny-output.cog.tif
```

The worker returned `status: succeeded`, rio-cogeo 5.4.2, no warnings, and a
1,304-byte output in 8.44 s wall time. The independent command reported
`tiny-output.cog.tif is a valid cloud optimized GeoTIFF`.

The worker source was executed from the repository rather than from a bundled
desktop resource. This proves the locked Linux raster toolchain and worker
pipeline, not service bundling or worker-resource packaging.

## Linux service-bundling and Electron-main evidence

### Runtime selection and bundle configuration

The probe ran on 2026-08-12 UTC on the same Linux x86_64 host described above.
The official
[version-specific Electron 43.4.0 release record](https://releases.electronjs.org/release/v43.4.0)
identifies Chromium 150.0.7871.224 and embedded Node.js 24.18.1. The probe pinned
that exact Electron version and targeted Node 24.18 in esbuild 0.28.1:

```sh
node_modules/.bin/esbuild apps/local-service/src/server.ts \
  --bundle --platform=node --format=esm --target=node24.18 \
  --banner:js='import { createRequire as __task2CreateRequire } from "node:module"; const require = __task2CreateRequire(import.meta.url);' \
  --outfile=.superpowers/sdd/desktop-00-packaging-spike/task-2/bundle/local-service.mjs \
  --metafile=.superpowers/sdd/desktop-00-packaging-spike/task-2/logs/esbuild-metafile.json \
  --log-level=info
```

The resulting single ESM artifact contained 231 inputs and was 1,871,875 B
(1,875,968 allocated bytes; 358,598 B after `gzip -9`). It bundled all
repository workspace dependencies and the third-party packages `fflate`,
`pmtiles`, `undici`, and `zod`. The only externals were Node runtime built-ins,
which cannot be converted into application JavaScript and are resolved by
Electron's embedded Node runtime:

```text
module
node:assert, node:async_hooks, node:buffer, node:child_process, node:console
node:crypto, node:diagnostics_channel, node:dns, node:dns/promises, node:events
node:fs, node:fs/promises, node:http, node:http2, node:net, node:os, node:path
node:perf_hooks, node:querystring, node:sqlite, node:stream
node:stream/promises, node:timers, node:timers/promises, node:tls, node:url
node:util, node:util/types, node:worker_threads, node:zlib
```

The `createRequire` banner is necessary because bundled CommonJS `undici`
still dynamically requires Node built-ins. Without the banner, startup failed
at `Dynamic require of "node:assert" is not supported`. The first banner used
an unaliased `createRequire` and collided with a generated import; the unique
alias above is the tested configuration.

Running from the ignored spike directory, which contained the bundle but no
TypeScript service sources and invoked neither `tsx` nor a TypeScript loader,
returned HTTP 200 from `/health`. That standalone smoke used host Node 22.22.0
only as an additional compatibility observation; the measurements below use
Electron's actual embedded Node 24.18.1.

### Electron execution and API results

The package installed Electron 43.4.0 only under the ignored spike workspace.
An actual Electron main entry ran under `xvfb-run`, waited for `app.whenReady()`
through a callback, imported the ESM bundle, and configured a random loopback
port plus a distinct temporary projects directory per repeat:

```sh
for repeat in 1 2 3; do
  env TASK2_REPEAT="$repeat" \
    TASK2_PROJECTS_DIR=".../task-2/projects/repeat-$repeat" \
    timeout 30s xvfb-run -a ./node_modules/electron/dist/electron \
      --no-sandbox electron-app/main.mjs
done
```

Each repeat reported Electron 43.4.0, Node 24.18.1, and Chromium
150.0.7871.224. Each selected a different kernel-assigned loopback port. All
three repeats returned `/health` 200, created a project with
`POST /api/projects` 201, changed its description and opening narrative with
`PUT /api/projects/:id` 200, and read the persisted values back with
`GET /api/projects/:id` 200. `GET /` returned 404 `Not found`; the service does
not currently serve the editor, so this probe does not establish same-origin
editor/API behavior.

Main-entry-to-health latency is elapsed time from a timer initialized inside
`main.mjs`, after its static imports and helper definitions, to the first
responsive `/health` request. It excludes Xvfb and Electron process launch,
Electron loading, and main-module work before the timer; it is not an end-to-end
cold-start measurement. Idle RSS is `/proc/self/status` `VmRSS` for the Electron
main process after the API cycle and one idle second; it excludes Xvfb and
Electron child processes. Shutdown is elapsed time from self-delivered SIGTERM
through the service's `server.close` callback to the process exit event.

| Repeat | Main-entry to health |      Main-process idle RSS | Shutdown cleanup |
| -----: | -------------------: | -------------------------: | ---------------: |
|      1 |           225.680 ms | 211,447,808 B (201.65 MiB) |         0.668 ms |
|      2 |           256.334 ms | 211,771,392 B (201.96 MiB) |         0.527 ms |
|      3 |           210.205 ms | 211,943,424 B (202.13 MiB) |         1.055 ms |
| Median |           225.680 ms | 211,771,392 B (201.96 MiB) |         0.668 ms |

These are development-runtime measurements with a warm Electron download and
host page cache, not packaged installer or end-user performance measurements.
The `--no-sandbox` switch was required because the throwaway npm installation's
`chrome-sandbox` helper was not root-owned mode 4755; this is not an acceptable
production security configuration.

### Resource-root findings and required refactors

The bundled service still computes `REPOSITORY_DIRECTORY` as `../../..` from
its own `import.meta.url`. From the spike bundle that resolved to
`.superpowers/sdd`, demonstrating that bundle placement silently changes the
meaning of the repository root. The Electron wrapper could override the viewer
and Pixi paths to `process.resourcesPath/viewer` and
`process.resourcesPath/pixi`, but a folder export then failed because
`resources/viewer/index.html` had not been packaged. Creating the `boundaries`
example failed because `exampleAssets.ts` looked for
`bundle/example-assets/example-boundaries/everest-relief.png` beside the ESM
artifact. Conversion was not invoked, so the configured Pixi path was observed
but not re-proven here.

Phase 1 must therefore:

- separate server construction and lifecycle from module loading, returning an
  address and an awaitable close operation instead of starting during import;
- pass projects, viewer, Pixi, conversion-worker, and example-asset paths from
  the desktop shell as explicit resource configuration rather than deriving a
  repository root from `import.meta.url`;
- package the viewer/editor and example/conversion resources deliberately, and
  decide whether the service serves the editor at the loopback origin or the
  window loads a separate packaged URL with an explicit API-origin policy;
- bind port 0 directly and read `server.address()` rather than briefly releasing
  a probed random port, avoiding a port-selection race; and
- retain the tested ESM/CommonJS bridge or remove the bundled CommonJS dynamic
  require before treating the service artifact as production-ready.

## Gates still open

- A notarized, hardened-runtime macOS build has not been tested. Entitlements,
  quarantine behavior, code-signature integrity, and execution of downloaded
  conda binaries remain unknown.
- macOS arm64, macOS x64, and Windows x64 packaged-layout provisioning and
  conversion have not been tested.
- Windows signing and macOS notarization have not been tested or evidenced.
- Installer size, end-to-end launch cold start, a production-sandboxed desktop
  launch, renderer-inclusive memory, and viewer/editor performance remain
  unmeasured.
- The redistribution-license inventory remains incomplete.
- The current capability disclosure numbers need either a clearly named network
  download measurement or revised semantics; extracted environment size is
  materially larger, especially for `core`.

## Consequences

No shell technology is accepted by this ADR yet, and no later desktop plan may
claim the packaging spike passed on the strength of the Linux probes alone. The
probes provide a reproducible Linux baseline and expose cache redirection,
service lifecycle, ESM interop, and packaged-resource requirements. This ADR
should be completed or superseded only after the remaining platform, signing,
installer, renderer, and license gates have evidence.
