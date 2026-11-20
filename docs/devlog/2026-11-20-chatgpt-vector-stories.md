# ChatGPT plan usage and composed vector stories

Story creation now uses a local ChatGPT sign-in connection. The OpenAI API-key
provider and generated-image requests have been removed. The agent produces a
bounded story recipe; a deterministic composer supplies editable landscape,
flow, reveal, and diagram scenes using the existing reader primitives. Preview,
explicit acceptance, ordinary content editing, and manual publishing remain the
project lifecycle. Existing image stories and ready image candidates are retained.

Authentication uses a separate loopback callback, PKCE, one-shot state, signed
OIDC identity validation, a stable host registration, serialized token rotation,
and dedicated credential storage outside projects. A process lease prevents two
services from refreshing the same stored session concurrently. Desktop delegates
storage to its existing credential-store factory. Public connection status
contains account labels and state, never credentials. The editor supplies account
and model selection, cancellation, sign-out, and the ChatGPT usage-settings link.

The four scene templates have stable Storybook fixtures. Browser checks exercised
all four at 1200px and 390px, including reduced-motion still frames, and the
connection panel's disconnected, connected, pending, no-model, and permission
states at 390px. No horizontal page overflow was observed. Label sizing adapts to
bounded text length. This is a curated illustration system, not arbitrary generated
JavaScript, CSS, SVG, or measured geographic data.

## Verification

- Full suite: 166 files, 1,354 tests passed, including callback replay, account
  mismatch, signature/nonce/audience/expiry, token rotation, startup failure cleanup,
  UTF-8 stream boundaries, cancellation, and legacy-candidate coverage.
- Type checking, UI contracts, and independence checks passed.
- Editor, reader, local-service bundle, desktop compilation, and Storybook build
  passed. Browser controls changed scene layer positions; reduced motion disabled
  the scrubber and retained the still frame.
- Fixture publication and publishing without Git passed (126 tests).
- Mock generation smoke passed: preview, explicit acceptance, repeated acceptance
  without duplication, editing/reopening, and publication build. No live account
  credentials were read by the smoke tool.
- Live ChatGPT consent/model admission/inference is **not verified**. The first
  account test must be completed through the editor's browser sign-in flow.
- Electron smoke was blocked: downloading its missing runtime exhausted available
  disk space. The incomplete download was removed. Packaged target-machine,
  signing, and installer checks were not run; this is not a supported-release claim.
- Repository-wide formatting has four pre-existing failures in untouched files:
  `apps/local-service/src/example-assets/example-edge-of-ice/kronebreen-fronts.geojson`,
  `docs/superpowers/plans/2026-10-28-production-proof-desktop-pilot.md`,
  `stories/roadless-rule/assets/roadless-tongass.geojson`, and
  `stories/roadless-rule/assets/roadless-us-simplified.geojson`.

The implementation follows the documented [local sign-in integration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[models and inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
