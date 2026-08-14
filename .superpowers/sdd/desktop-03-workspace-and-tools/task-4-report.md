# Task 4 report — Desktop credential encryption

## Status

Implemented desktop credential encryption at the Electron main-process boundary. Desktop sign-in now stores a versioned safeStorage-encrypted token where the OS keychain is available, migrates the existing same-path plaintext record atomically on first read, and retains the existing private plaintext file behavior with a one-time explicit diagnostic when encryption is unavailable.

## Implementation

- Added `apps/desktop/src/credentials.ts` with `SafeStorageCredentialStore`, implementing the `CredentialStore` contract exported by `@earth-stories/local-service`.
- The persisted encrypted record is `{ version: 1, login, encryptedToken }`; encrypted bytes are treated as opaque and base64-encoded. The plaintext token is absent from the record.
- Encrypted writes create a mode-0600 temporary file in a mode-0700 directory, flush the file, atomically rename it over `credentials.json`, and flush the containing directory. The same-path promotion means readable plaintext is not removed before encrypted replacement.
- First read of a valid legacy `{ token, login }` file encrypts and durably replaces it before returning credentials. Encryption/write failure is sanitized and leaves the original plaintext file unchanged when promotion has not occurred.
- With no keyring, plaintext reads/writes continue through `FileCredentialStore`; the store emits the plaintext-fallback warning once per instance. Existing encrypted records return no credentials and cannot be overwritten with plaintext when encryption later becomes unavailable.
- Missing, malformed, invalid-base64, and undecryptable records return `null`; diagnostics contain no credential values. `clear()` removes the same-path active/legacy artifact.
- Added a factory binding only the Electron `safeStorage` boundary. `runElectronDesktop()` supplies that factory to `DesktopService`; no credential or encryption API was added to preload, IPC, or renderer code. Standalone local-service wiring remains on `FileCredentialStore`.

## Strict TDD evidence

Tests use real temporary filesystem paths. Only the Electron `safeStorage` boundary is substituted.

### RED 1

Command:

```text
yarn vitest run apps/desktop/src/credentials.test.ts apps/desktop/src/service.test.ts
```

Observed expected failure:

```text
FAIL apps/desktop/src/credentials.test.ts
Error: Cannot find module './credentials.js'
Test Files 1 failed | 1 passed
Tests 10 passed
```

The new credential tests could not load the not-yet-created production store. The independently useful DesktopService injection/wiring contract passed.

### GREEN 1

Same command after the minimum store implementation:

```text
Test Files 2 passed (2)
Tests 17 passed (17)
```

This covered encrypted round trip and private modes, plaintext migration, failed migration preserving plaintext, no-keyring fallback and one-time diagnostic, malformed/decrypt handling without token leakage, no downgrade, clear, and DesktopService credential injection.

### RED 2

Command:

```text
yarn vitest run apps/desktop/src/credentials.test.ts
```

Observed expected failure after adding the Electron-bound factory behavior test:

```text
FAIL SafeStorageCredentialStore > creates desktop stores bound to Electron safeStorage
TypeError: createSafeStorageCredentialStoreFactory is not a function
Tests 1 failed | 7 passed
```

### GREEN 2 / focused integration

Command:

```text
yarn vitest run apps/desktop/src/credentials.test.ts apps/desktop/src/service.test.ts apps/desktop/src/main.test.ts apps/local-service/src/credentials.test.ts apps/local-service/src/github-auth.test.ts
yarn workspace @earth-stories/desktop build
```

Observed:

```text
Test Files 5 passed (5)
Tests 77 passed (77)
desktop build exit 0
```

## Broader verification

Initial sandboxed broad run:

```text
yarn vitest run apps/desktop/src apps/local-service/src
Test Files 4 failed | 28 passed
Tests 23 failed | 376 passed
```

Those failures were environmental: localhost listeners received `EPERM`, and spawned Node subprocesses returned empty captured output. The exact suite was rerun with listener/child-process permissions:

```text
yarn vitest run apps/desktop/src apps/local-service/src
Test Files 1 failed | 31 passed
Tests 1 failed | 398 passed
```

All desktop tests and all credential/auth tests passed. The only remaining failure is the pre-existing `apps/local-service/src/service-bundle.test.ts` relocated-bundle fixture: its temporary bundle lacks `pixi.lock`, so it observes `bootstrapCalls: 0` / `injectedStatus: failed` instead of its expected bootstrap success. No Task 4 file or credential behavior is implicated.

Final static/build checks:

```text
yarn typecheck
yarn workspace @earth-stories/desktop build
npx prettier --check apps/desktop/src/credentials.ts apps/desktop/src/credentials.test.ts apps/desktop/src/service.test.ts apps/desktop/src/main.ts
git diff --check
```

Observed: exit 0; Prettier reported all matched files use its code style; diff check was clean.

## Files

- `apps/desktop/src/credentials.ts` — encrypted store and safeStorage-bound factory.
- `apps/desktop/src/credentials.test.ts` — real-filesystem credential and factory tests.
- `apps/desktop/src/main.ts` — Electron main-process safeStorage wiring.
- `apps/desktop/src/service.test.ts` — local-service credential-store injection contract.
- `.superpowers/sdd/desktop-03-workspace-and-tools/task-4-report.md` — this report.

## Self-review

- Confirmed encrypted output cannot contain the input token and encrypted bytes round-trip solely through the boundary.
- Confirmed a plaintext record is only replaced through flushed-temp-file plus atomic rename, and an encryption failure leaves its bytes unchanged.
- Confirmed no-keyring writes refuse to replace a versioned encrypted record, preventing one-way migration from becoming a downgrade.
- Confirmed diagnostics are fixed strings and tests specifically check malformed plaintext token content is absent from emitted warnings.
- Confirmed fallback warning de-duplicates per store instance.
- Confirmed desktop-only safeStorage usage stays in `main.ts`/the main-process credential module; preload and renderer are untouched.
- Confirmed standalone service code is untouched and retains `FileCredentialStore`.
- Reviewed realistic mutations: plaintext persistence, skipped migration, wrong availability branch, missing no-downgrade check, malformed decryption, repeated warning, missing clear, incorrect injected store, and absent safeStorage factory are each caught by a test.

## Concerns

- The initially unrelated relocated service-bundle fixture failure is resolved in the final integration fixture repair recorded below.
- Directory `fsync` portability is handled by ignoring only Windows `EINVAL`/`EPERM`; other flush failures remain visible rather than claiming durability.

## Fix Round 1

### Findings addressed

1. Made plaintext migration rollback-safe across failures after same-path encrypted promotion. Before replacement, the store writes the exact legacy bytes to a mode-0600 recovery artifact, flushes the file and directory, then promotes the encrypted record. A failure securing the promoted file or flushing its directory restores the recovery artifact to the active credentials path and flushes that restoration. If restoration itself cannot finish, the recovery artifact is deliberately retained instead of deleting the only readable plaintext copy. `clear()` now removes both the active path and recovery path.
2. Strengthened no-keyring downgrade protection. Any parsed object with its own `version` marker is protected from plaintext overwrite, including records from unknown future versions; the store does not need to understand their opaque payload.

### RED

Command:

```text
yarn vitest run apps/desktop/src/credentials.test.ts
```

Observed expected failures before implementation:

```text
Test Files 1 failed (1)
Tests 3 failed | 8 passed (11)
```

- Injected post-rename credential chmod failure resolved instead of rejecting and restoring.
- Injected post-rename directory fsync failure resolved instead of rejecting and restoring.
- A future-version record was overwritten by the no-keyring plaintext fallback instead of being rejected.

After introducing the recovery artifact, its clear behavior was independently driven through RED with the same command:

```text
Test Files 1 failed (1)
Tests 1 failed | 10 passed (11)
```

The active credentials file was removed, but the recovery artifact remained readable.

### GREEN

Same command after the minimal implementation:

```text
Test Files 1 passed (1)
Tests 11 passed (11)
```

Both injected post-rename failures now reject with the fixed sanitized protection error, leave the original plaintext bytes at the active path, and remain readable through a new fallback store. The future-version write rejects and leaves the original bytes unchanged without logging the replacement token. Clear removes both the active and recovery artifacts.

## Final integration fixture repair

The relocated production-bundle test fixture now copies the repository's real immutable `pixi.lock` alongside `service.js`, its source map, and the harness. Its exact relocated-file assertion includes that lock while continuing to prove the repository `scripts` directory is absent. Production lock parsing and pinned-version disclosure remain unchanged; both injected-bootstrap success and missing-bootstrap failure expectations remain intact.

### RED

The controller's elevated reproduction established the fixture regression before this change:

```text
apps/local-service/src/service-bundle.test.ts
ENOENT: no such file or directory, open '<relocated temporary directory>/pixi.lock'
bootstrapCalls: 0
injectedStatus: failed
```

### GREEN

Command:

```text
yarn vitest run apps/local-service/src/service-bundle.test.ts
```

Observed with loopback/subprocess permissions:

```text
Test Files 1 passed (1)
Tests 1 passed (1)
```

## Final Electron smoke fixture repair

The smoke fixture's exact approved preload-bridge key list now matches the nine-key production bridge and preload unit contract. No smoke assertion or production bridge behavior changed.

### RED

The controller's Electron smoke run reached the application with every security assertion true, but rejected the received nine bridge keys because the fixture still expected the pre-desktop-03 five-key list.

### GREEN

Command:

```text
yarn workspace @earth-stories/desktop smoke:electron
```

Observed with GUI/loopback permissions:

```text
bridgeKeys: chooseWorkspace, listTools, openExternal, platform, removeTool, showProjectFolder, showWorkspaceFolder, version, workspacePath
contextIsolation: true
sandbox: true
nodeIntegration: false
storagePath: null
serviceAuthenticated: true
maliciousTokenAbsent: true
tokenContained: true
exit 0
```
