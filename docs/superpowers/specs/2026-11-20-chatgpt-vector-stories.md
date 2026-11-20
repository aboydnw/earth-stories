# ChatGPT sign-in and curated vector story creation

Approved direction: replace OpenAI API-key generation with direct ChatGPT plan
usage for this local/open-source application. Remove image-generation requests;
AI selects curated editable vector scenes. Existing authored stories and ready
legacy candidates remain readable. No automatic publishing.

The local service owns PKCE sign-in on a separate ephemeral 127.0.0.1 callback,
OIDC signature/issuer/audience/expiry/nonce validation, account registrations,
rotating credentials, model discovery and streamed Responses inference. Tokens
never enter browser storage, projects, public service JSON responses, logs, or
environment variables.
Protected credential records persist outside the workspace. Desktop uses its
existing OS-protected credential store; standalone uses owner-only atomic files.
Refreshes and sign-in changes serialize; sign-out cancels active generation.

The editor shows Continue with ChatGPT, account selection/reconnection, model
selection, sign-out, Manage usage and actionable admission/limit errors. No API
key fallback. Requests use store:false, stream:true and account-listed models.
Only response.completed counts as success. Untrusted reference material remains
quoted data; existing text/PDF/image input normalization and SSRF protection stay.

AI outputs constrained scene recipes, not executable code or arbitrary paths.
A deterministic composer builds landscape, flow, reveal and diagram scenes using
existing path/text/keyframe primitives. Typography, safe label lengths, palette
roles, bounds and motion are curated. All scenes have an attractive static frame;
shared viewer, reduced motion, archive and editing remain authoritative.

Validation: OAuth adversarial callbacks and signed JWT fixtures, rotating tokens,
restart/sign-out races, malformed/interrupted/limited SSE, absence of API-key and
image endpoint paths, template determinism/bounds, mock-backed generation through
acceptance/reopen, UI states, full repo baseline and relevant publishing/desktop
checks. Live sign-in requires the human's browser consent and must be reported
separately from mocked verification.
