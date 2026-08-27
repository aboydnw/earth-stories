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

Proceed with Electron for the next desktop design iteration, provisionally. It
is the only shell exercised in this spike: Electron 43.4.0 ran the bundled
service with its embedded Node 24.18.1, avoiding a second Node runtime or a
sidecar boundary. Tauri remains the named alternative and supports packaged
external binaries as
[sidecars](https://v2.tauri.app/develop/sidecar/), but this service would still
need a Node/Python executable boundary and Tauri would not by itself make
downloaded conda executables acceptable to macOS hardened runtime.

This choice is not acceptance of the desktop architecture. It expires if the
notarized macOS probe cannot execute the locked Pixi environment without
weakening runtime protections, or if any quantitative revisit trigger below is
crossed. The Linux evidence supports continuing with the copied-manifest Pixi
design: exact-version, checksum-verified Pixi installed locked environments and
ran the real conversion worker without observed modification of the modeled
packaged resources. A single-file ESM service bundle also started and completed
the core project API lifecycle in Electron, but current resource-root
assumptions and the absence of editor serving prevent that bundle from being a
package-ready desktop service.

Any implementation that advances from this spike must copy and digest-verify
both `pixi.toml` and `pixi.lock`, restore mismatched copies before execution, use
`--manifest-path` and `--locked`, and explicitly place Pixi home and cache data
under the per-user tools directory.

The packaged `pixi.toml` and `pixi.lock` digests must also be bound together in
an authenticated release-integrity record covered by the application's platform
signature. Provisioning must verify both packaged files against that record
before copying them, verify the pair again before atomically promoting the
writable copy, and verify it immediately before every Pixi execution. A missing,
invalid, or mismatched record or file fails closed; no desktop release gate may
be marked complete from an unsigned or partially verified pair.

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
1,304-byte output in 8.44 s wall time, 3.41 s user time, 0.27 s system time,
and 108,676 KiB maximum RSS. The independent command reported
`tiny-output.cog.tif is a valid cloud-optimized GeoTIFF`.

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

The ignored development installation's Electron package tree was 328,595,366 B
apparent. Its `dist` directory was 327,450,682 B, including the 221,064,440 B
Electron executable and 2,731,688 B `libffmpeg.so`. These are unpacked
development-runtime footprints, not a compressed, signed installer measurement.

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
only as an additional compatibility observation: bundle import to responsive
health was 149.705 ms and process `VmRSS` was 85,948 KiB. The target-runtime
measurements below use Electron's actual embedded Node 24.18.1.

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
|   Mean |           230.740 ms | 211,720,875 B (201.91 MiB) |         0.750 ms |

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

## Redistribution inventory

`Yes`, `no`, and `unresolved` below are evidence dispositions, not legal
opinions. `Yes` means the identified license and required notice action are
available; counsel still owns the release review.

| Item or group                                                    | Delivered by                                                                           | License identifier, durable evidence, and exact source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Required release action                                                                                                                                                                                          | Disposition    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Electron 43.4.0                                                  | Installer                                                                              | MIT. The version-pinned [Electron v43.4.0 license](https://github.com/electron/electron/blob/v43.4.0/LICENSE) is byte-identical to installed `LICENSE`: 1,096 B, SHA-256 `5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d`                                                                                                                                                                                                                                                                                                                                                                                                                                               | Ship the exact Electron MIT payload in the appendix below                                                                                                                                                        | Yes            |
| Chromium, Node, native libraries, and `libffmpeg.so` in Electron | Installer                                                                              | Multi-license bundle: per-component names, license identifiers/headings, copyright notices, and license text are enumerated in `LICENSES.chromium.html`. The exact official [Electron v43.4.0 Linux x64 release asset](https://github.com/electron/electron/releases/download/v43.4.0/electron-v43.4.0-linux-x64.zip) is 125,622,703 B with publisher SHA-256 `7c5f7918bcae74a05a814543940eb28469c055edaa3cfcf41d0ff1787b314c52` in the release's [SHASUMS256.txt](https://github.com/electron/electron/releases/download/v43.4.0/SHASUMS256.txt). Its installed `LICENSES.chromium.html` is 19,956,019 B with SHA-256 `4fc0507a046b9ecd0738b2dd64119b5ec8bc29ac0221b63edb693fd5fd497c87` | Ship that exact `LICENSES.chromium.html` verbatim and verify its recorded size and hash during packaging                                                                                                         | Yes            |
| Media-codec patent/territory review                              | Installer, through Electron's `libffmpeg.so`                                           | Not a single copyright license identifier; this is a separate patent/availability question. The exact v43.4.0 asset and multi-license notice file above are the durable binary and copyright sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Have counsel review the enabled codec set and target territories; copyright notice preservation does not resolve patent scope                                                                                    | Unresolved     |
| Pixi 0.76.1                                                      | Lazy, direct user download in the tested design; installer only if that design changes | BSD-3-Clause in the version-pinned [Pixi v0.76.1 license](https://github.com/prefix-dev/pixi/blob/v0.76.1/LICENSE)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Ship the exact BSD-3-Clause payload in the appendix below if Earth Stories bundles, mirrors, or redistributes Pixi; retain pinned checksum verification either way                                               | Yes            |
| Locked Linux `core` environment, 30 records                      | Lazy user download from conda-forge                                                    | Exact builds, declared license identifiers, and artifact source URLs are in the tracked [`pixi.lock`](../../pixi.lock); the installed metadata confirmed the same URLs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Generate an SBOM and exact notice payload from each target platform's final package records; review the copyleft and exception-bearing packages below before any mirroring, offline cache, or installer bundling | Unresolved     |
| Locked Linux `raster` environment, 98 records                    | Lazy user download from conda-forge                                                    | Exact builds, declared license identifiers, and artifact source URLs are in the tracked [`pixi.lock`](../../pixi.lock); installed metadata included native GDAL/PROJ/GEOS and codec libraries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Same as `core`; do not treat lazy download as permission to omit product disclosure or future offline-bundle review                                                                                              | Unresolved     |
| Bundled fonts (Plus Jakarta Sans, DM Mono)                       | Installer and every offline publication                                                | **Resolved 2026-08-27.** The checked-in `Satoshi-Variable.woff2` was removed and replaced with `@fontsource-variable/plus-jakarta-sans`. Both bundled families are SIL OFL 1.1 and ship from npm packages carrying their license text, so redistribution inside the installer and inside published output is permitted with attribution. The earlier concern stands as recorded: Fontshare's ITF FFL restricts distribution of the font files themselves, which is why the font was replaced rather than cleared                                                                                                                                                                          | Record both families in the third-party notices and keep them sourced from packages that carry their license                                                                                                     | Yes — resolved |

### Required notice payloads

The installer must reproduce this exact Electron 43.4.0 MIT payload:

```text
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

If Earth Stories bundles, mirrors, or redistributes Pixi 0.76.1, it must
reproduce this exact BSD-3-Clause payload in the documentation or other
materials supplied with the binary distribution:

```text
BSD 3-Clause License

Copyright (c) 2023, prefix.dev GmbH

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The 19,956,019 B Chromium notice bundle is not duplicated in this ADR. Its exact
payload remains reproducible after scratch deletion from the versioned release
asset, filename, size, and SHA-256 recorded above; packaging must copy the file
from the pinned Electron distribution rather than regenerate or summarize it.

The installed `core` records were `_openmp_mutex`, `annotated-types`, `bzip2`,
`ca-certificates`, `icu`, `ld_impl_linux-64`, `libexpat`, `libffi`, `libgcc`,
`libgomp`, `liblzma`, `libnsl`, `libsqlite`, `libstdcxx`, `libuuid`,
`libxcrypt`, `libzlib`, `ncurses`, `openssl`, `pydantic`, `pydantic-core`,
`python`, `python_abi`, `readline`, `tk`, `typing-extensions`,
`typing-inspection`, `typing_extensions`, `tzdata`, and `zstd`. All were also
present in `raster`.

The 98 `raster` metadata records grouped by their declared strings as follows:
30 MIT; 23 BSD-3-Clause; 7 GPL-3.0-only WITH GCC-exception-3.1; 3 each
Apache-2.0, BSD-2-Clause, LGPL-2.1-only, and Zlib; 2 each GPL-2.0-or-later,
GPL-3.0-only, ISC, LGPL-2.1-or-later, MPL-1.1, PSF-2.0, and `blessing`; and one
each 0BSD, Apache-2.0 OR BSD-3-Clause, BSD-2-Clause OR GPL-2.0-or-later, HPND,
IJG AND BSD-3-Clause AND Zlib, LicenseRef-Public-Domain, Python-2.0, TCL, X11
AND BSD-3-Clause, `bzip2-1.0.6`, `curl`, and `zlib-acknowledgement`. The
attention set is:

- GPL-3.0-only: `ld_impl_linux-64`, `readline`;
- GPL-3.0-only WITH GCC-exception-3.1: `libgcc`, `libgcc-ng`, `libgfortran`,
  `libgfortran5`, `libgomp`, `libstdcxx`, `libstdcxx-ng`;
- GPL-2.0-or-later: `librttopo`, `lzo`; dual BSD-2-Clause OR
  GPL-2.0-or-later: `libev`;
- LGPL: `geos`, `keyutils`, `libiconv`, `libnsl`, `libxcrypt`; and
- MPL-1.1: `freexl`, `libspatialite`.

This preserves the metadata's exception and alternative-license wording. It
does not assert that any particular combination is automatically
redistributable. The production SBOM must also inventory the final editor,
viewer, and bundled-service JavaScript dependency graph; this spike did not
produce a release installer from which to capture that graph.

## Entitlements and external signing gates

No entitlements were applied or tested on Linux. Linux execution used
`--no-sandbox` solely because the throwaway Electron install lacked a configured
SUID helper; production must not use that switch.

No macOS entitlement has been tested. The signed probe must begin with hardened
runtime and the renderer's likely `com.apple.security.cs.allow-jit`, then record
the entitlement on every signed executable. Apple's notarization guidance says
hardened runtime is required and describes JIT as a targeted exception
([notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)). Do not add
`com.apple.security.cs.allow-unsigned-executable-memory` or
`com.apple.security.cs.disable-library-validation` merely to make the probe
pass; Apple describes library validation as an important hardening feature and
subjects disabled applications to extra Gatekeeper checks
([entitlement documentation](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation)).
Developer ID credentials, notarization, quarantine behavior, code-signature
integrity after provisioning, and downloaded Pixi/conda execution are unresolved
external gates.

Windows Authenticode signing is also an unresolved external gate. The current
CA/Browser Forum requirements say that, effective June 1, 2023, subscriber
private keys for code-signing certificates must be generated, stored, and used
in a qualifying hardware crypto module
([baseline requirements](https://cabforum.org/working-groups/code-signing/requirements/)). Select and procure an HSM-backed signing service, then test a
signed installer on a clean Windows x64 host.

## Spike-question evidence matrix

| Question                                                                            | Evidence                                                                                                                                                                                                                                                                           | Result                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Can a notarized hardened-runtime macOS build run downloaded conda binaries?         | No macOS host, Developer ID signing, notarization, entitlement, quarantine, or clean-machine run occurred                                                                                                                                                                          | Open — architecture gate                                                    |
| Does copied-manifest Pixi work from real packaged resources on all three platforms? | Linux x64 installed `core` and `raster`, ran a real COG conversion, detected/restored tampering, and left the permission-modeled resources unchanged; Windows and macOS were not run, and the worker still came from the repository                                                | Partially answered; open on macOS and Windows                               |
| Can the service and workspace dependencies be packaged, and what does it cost?      | One 1,871,875 B ESM file with only Node built-ins external ran three Electron API cycles; `/` remained 404 and packaged viewer/example/worker resources were absent                                                                                                                | Bundle feasibility answered; package-ready same-origin service remains open |
| Can the redistributed components ship with known obligations?                       | Exact Electron, Chromium-bundle, and conditional Pixi notice payloads are durably recorded; conda groups still need notice/counsel review; codec patent review is open; the DuckDB spatial extension bundles GDAL and needs a component SBOM; fonts are resolved under SIL OFL 1.1 | No — DuckDB/GDAL and conda reviews outstanding; font blocker resolved       |

## Revisit triggers and failure path

Performance gates must be reproduced on the declared minimum hardware and OS
using a versioned representative story fixture and a recorded pan/zoom input
trace. Before each cold-launch sample, stop the complete application process
tree and reset the documented application, filesystem, and shader caches; record
process start, service-ready, first-window, story-interactive, and first-frame
events. Report the median of five launches. Measure RSS for the complete Electron
process tree at one-second intervals through launch and the 30-second idle
window. Capture frame timing from the same browser performance trace while
replaying the fixed input sequence, and report median FPS plus the percentage of
frames over 33 ms. Every gate result must identify the machine, OS build,
fixture revision, cache-reset procedure, trace tooling, and raw sample set.

Replace Electron with a Tauri comparison spike, or revisit the distribution
architecture, when any of these occurs:

- any compressed, signed installer exceeds 250 MiB before lazy capability
  downloads;
- median end-to-end cold launch exceeds 3.0 s across five launches on the
  declared minimum-spec reference machine;
- the total Electron process tree exceeds 500 MiB RSS after a representative
  story has been open and idle for 30 seconds;
- representative pan/zoom playback falls below 55 frames/s median or has more
  than 1% of frames slower than 33 ms;
- the team cannot remain within Electron's latest three supported releases,
  deliver a critical runtime security update within 7 days and other supported
  runtime updates within 30 days, or emergency runtime updates average more than
  one per month for three consecutive months. Electron documents an eight-week
  major cadence and support for only the latest three stable releases
  ([release policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)); or
- notarization or signed execution requires disabling the renderer sandbox,
  disabling library validation, allowing unsigned executable memory, or another
  comparably broad runtime exception.

If hardened-runtime Pixi execution fails, stop before `desktop-02`; do not waive
the final trigger. First compare a signed, installer-bundled conversion runtime
under Electron with the same runtime as a Tauri-packaged sidecar. Measure both
against the 250 MiB ceiling and repeat notarization on a clean Mac. If a signed
local runtime cannot satisfy both execution and size gates, remove local Pixi
execution from the desktop design and use a hosted conversion service (with a
clear offline limitation) rather than shipping weakened runtime protections.

## Next actions

1. ~~Resolve Satoshi provenance or replace it before any installer or offline
   publication release.~~ Done 2026-08-27: replaced with Plus Jakarta Sans
   (SIL OFL 1.1). The DuckDB spatial extension's bundled GDAL still needs a
   component SBOM and notice review before public redistribution.
2. Acquire Developer ID access; run, notarize, install, and convert on a clean
   Mac while recording entitlements, quarantine, signatures, and the full
   process tree.
3. Select an HSM-backed Windows signing service and repeat the packaged-layout
   conversion on a clean signed Windows x64 installer.
4. Refactor service lifecycle and resource injection, package the editor/viewer,
   examples, and worker, then measure signed installer bytes, true cold start,
   total process-tree RSS, shutdown cleanup, and viewer frame pacing.
5. Generate per-platform SBOMs and third-party notices from the final installers
   and lazy environments; send copyleft, codecs/patents, and font terms for
   counsel review.

## Gates still open

- A notarized, hardened-runtime macOS build has not been tested. Entitlements,
  quarantine behavior, code-signature integrity, and execution of downloaded
  conda binaries remain unknown.
- macOS arm64, macOS x64, and Windows x64 packaged-layout provisioning and
  conversion have not been tested.
- Windows signing and macOS notarization have not been tested or evidenced.
- Installer size, end-to-end launch cold start, a production-sandboxed desktop
  launch, total process-tree memory, and viewer frame rate remain unmeasured.
- The redistribution inventory is recorded. The font blocker is resolved; the
  DuckDB spatial/GDAL SBOM, conda, codec/patent, and final per-platform notice
  reviews remain unresolved.
- The current capability disclosure numbers need either a clearly named network
  download measurement or revised semantics; extracted environment size is
  materially larger, especially for `core`.

## Consequences

Electron is the provisional implementation direction, not an accepted release
architecture, and no later desktop plan may claim the packaging spike passed on
the strength of the Linux probes alone. The probes provide a reproducible Linux
baseline and expose cache redirection, service lifecycle, ESM interop,
packaged-resource, signing, and notice requirements. `desktop-02` remains gated
on notarized hardened-runtime Pixi execution. Release additionally remains
blocked on font provenance and the unresolved per-platform redistribution
review.
