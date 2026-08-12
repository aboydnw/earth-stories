# Task 2 report — runtime lifecycle, standalone entrypoint, activity, and drain

## Status

DONE

## Implementation

- Added `runtime.ts` with `startLocalService(config)`, resolved port/origin/project-directory reporting, retained conversion and Pages registries, activity reporting, coordinated drain, typed startup errors, and prompt idempotent connection cleanup.
- Runtime now owns store and registry construction; `createLocalServer` requires injected registries and no longer hides lifecycle state in defaults.
- Added stable `LocalServiceStartupError.code` values for address-in-use, access-denied, missing/non-directory viewer paths, unwritable projects paths, and generic startup failures while preserving the previous standalone listen messages.
- Added registry seams for refusing new work, activity counts, cooperative cancellation, and idle notification. Refusal is checked again after asynchronous validation to close the drain/enqueue race.
- Conversion cancellation reaches both Pixi provisioning and worker execution through `AbortSignal`, allowing the spawned process to terminate cooperatively.
- Publish cancellation supplies a signal to sign-in dependencies and checks cancellation between each existing publication stage. Jobs that do not cooperate remain counted and are returned when drain times out.
- Added `standalone.ts` with side-effect-free config resolution, all four legacy environment variables/default paths, unchanged readiness/error text, and SIGINT/SIGTERM handling through `close()`. Standalone never drains.
- Updated local-service `dev` and `start` scripts to execute the standalone entrypoint.
- Preserved API snapshot/response shapes and the intentional CI removal.

## Files

- Added `apps/local-service/src/runtime.ts`
- Added `apps/local-service/src/runtime.test.ts`
- Added `apps/local-service/src/standalone.ts`
- Added `apps/local-service/src/standalone.test.ts`
- Updated conversion runtime/jobs and their tests
- Updated Pages jobs and tests
- Updated server construction/tests
- Updated the optional GitHub sign-in dependency seam
- Updated `apps/local-service/package.json`

## TDD evidence

### Initial RED

Command:

`yarn vitest run apps/local-service/src/conversion-jobs.test.ts apps/local-service/src/pages-jobs.test.ts apps/local-service/src/runtime.test.ts apps/local-service/src/standalone.test.ts`

Result:

- Test Files: 4 failed (4)
- Tests: 2 failed, 13 passed
- Registry tests failed with `jobs.activity is not a function`.
- Runtime and standalone suites failed collection because their modules did not exist.

Production changes that made this green: registry lifecycle seams, runtime ownership/listening/close/drain/errors, standalone resolver/entrypoint, and script updates.

### Drain/enqueue race and timeout RED

Command:

`yarn vitest run apps/local-service/src/conversion-jobs.test.ts apps/local-service/src/runtime.test.ts`

Result:

- Test Files: 2 failed (2)
- Tests: 2 failed, 10 passed
- A conversion whose async validation overlapped drain proceeded beyond refusal.
- The drain coordinator seam did not yet exist.

Production changes that made this green: a post-validation refusal check and `drainJobRegistries`, which latches both registries, requests cancellation, waits until idle or timeout, and returns live counts.

### Conversion cancellation RED

Command:

`yarn vitest run apps/local-service/src/conversion-runtime.test.ts -t "cooperative cancellation"`

Result:

- Test Files: 1 failed (1)
- Tests: 1 failed, 3 skipped
- The worker command received the signal but the provisioning command did not.

Production change that made this green: thread the same signal through `provision()`.

### Viewer-file classification RED

Command:

`yarn vitest run apps/local-service/src/runtime.test.ts -t "missing viewer and unwritable"`

Result:

- Test Files: 1 failed (1)
- Tests: 1 failed, 8 skipped
- A configured viewer path that existed as a file received `startup-failed` instead of the stable missing-viewer code.

Production change that made this green: classify both absent and non-directory viewer paths as `missing-viewer-directory`.

## Verification

### Focused lifecycle matrix

Command:

`yarn vitest run apps/local-service/src/conversion-jobs.test.ts apps/local-service/src/pages-jobs.test.ts apps/local-service/src/runtime.test.ts apps/local-service/src/standalone.test.ts`

Result: 4 files passed; 27 tests passed.

### Relevant local-service matrix

Command:

`yarn vitest run apps/local-service/src/server.test.ts apps/local-service/src/config.test.ts apps/local-service/src/conversion-runtime.test.ts apps/local-service/src/conversion-jobs.test.ts apps/local-service/src/pages-jobs.test.ts apps/local-service/src/runtime.test.ts apps/local-service/src/standalone.test.ts`

Result: 7 files passed; 52 tests passed.

### Final runtime suite

Command:

`yarn vitest run apps/local-service/src/runtime.test.ts`

Result: 1 file passed; 9 tests passed.

### No-git publishing suite

Command:

`yarn test:publishing:no-git`

Result: 3 files passed; 65 tests passed.

### Full suite

Command:

`yarn test`

Result: 57 files passed; 370 tests passed. Existing non-failing jsdom CSS parse warnings remain.

### Typecheck, format, and diff

Commands:

- `yarn typecheck`
- `npx prettier --check` on every changed source/test/package file
- `git diff --check`

Results: typecheck exited 0 without diagnostics; all files match Prettier; diff check exited 0.

Loopback-dependent suites were run with loopback access because the restricted sandbox denies local binds with `EPERM`.

## Self-review

- Confirmed imports of runtime and standalone-compatible helpers neither listen nor create workspaces.
- Confirmed two port-zero services bind distinct ports and isolated project roots.
- Confirmed the runtime binds only `127.0.0.1` and reports the OS-selected port.
- Confirmed close is repeatable and destroys tracked keep-alive sockets before waiting for server closure.
- Confirmed activity counts jobs retained by each registry and returns to zero only when their work settles.
- Confirmed drain refuses both conversion and publish creation, requests cancellation, resolves when cooperative work finishes, and returns remaining counts on timeout without killing jobs.
- Confirmed asynchronous job validation cannot cross the refusal latch and enqueue afterward.
- Confirmed all four requested startup failure classes have stable typed codes.
- Confirmed standalone environment/default path behavior matches the removed module constants for port, projects, viewer, and Pixi paths.
- Confirmed readiness and listen-failure text matches the prior standalone behavior and standalone signal handling calls only `close()`, never `drain()`.
- Confirmed server response bodies and job snapshot interfaces are unchanged.
- Confirmed no Electron, static editor, capability enforcement, CI workflow, or credential-storage implementation entered this task.
- Mutation check: hidden registry defaults, wrong resolved port, lost ownership isolation, missing socket destruction, non-idempotent close, missing refusal recheck, absent cancellation signal, premature drain completion, wrong timeout counts, changed standalone defaults, or unstable startup codes each fail focused coverage.

## Commit

This Task 2 commit: `refactor: add local service runtime lifecycle`.

## Concerns

None.
