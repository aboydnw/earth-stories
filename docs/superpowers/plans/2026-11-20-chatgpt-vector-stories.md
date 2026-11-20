# ChatGPT vector stories implementation plan

User authorized implementation of the preceding design in this conversation.
Execute inline; preserve unrelated main-checkout documents.

## 1. Local authentication

- [x] Add shared public connection/model types; no secrets in public responses.
- [x] Add signed-token and callback regression tests (wrong state, nonce,
      issuer/audience, expired token, swapped client/account, replay).
- [x] Implement `ChatGPTConnection` with `initialize`, `status`, `start`,
      `cancel`, `signOut`, `access`, `close`, serialized refresh and persisted records.
- [x] Use dedicated credential store supplied through LocalServiceConfig;
      standalone owner-only file and desktop existing safe-storage factory.
- [x] Route authenticated POST sign-in/cancel/sign-out and GET status/models
      behind the existing service capability/origin checks. Callback has its own
      loopback listener, one-shot state, bounded lifetime and safe static response.

## 2. Curated scenes and provider

- [x] Add recipe/template tests before implementation, then deterministic
      landscape/flow/reveal/diagram composition with bounded text and motion.
- [x] Add `ChatGPTProvider` tests for model discovery, strict output validation,
      streaming UTF-8/chunk framing, incomplete streams, limit errors and cancellation.
- [x] Replace API-key provider entirely; require signed-in session and listed
      model. Remove image generation from provider/jobs. Preserve legacy candidate
      reading; reject retry of incomplete legacy image work with a fresh-start message.

## 3. Editor and end-to-end wiring

- [x] Add account/model UI tests, then connection component and API methods.
- [x] Keep sign-in URLs server-owned; open only the local launch URL in browser
      or desktop system browser. Never expose tokens to renderer.
- [x] Update job state text and result copy for vector illustration creation.
- [x] Add stable Storybook and representative multi-scene fixtures; verify shared
      reader, mobile/reduced motion, archive and editable accepted story.

## 4. Verification and delivery

- [x] Update runtime docs and smoke tooling; remove active API-key instructions.
- [x] Run focused regressions, full tests/types/UI/independence/format/build,
      fixture publication/Storybook and publishing without Git; desktop resource
      tests/build as affected. Record baseline failures and unavailable live checks.
- [x] Review diff for secret exposure, missing old-job compatibility and arbitrary
      executable output. Commit, push, open draft PR with precise verification.

Verification evidence and remaining live-account/desktop limitations are recorded in
[the implementation devlog](../../devlog/2026-11-20-chatgpt-vector-stories.md).
