# GitHub App exchange broker

This server-only workspace exchanges an authorization code and PKCE verifier
for a GitHub App user access token. It is deployed separately from Earth Stories.
The client secret must never be shipped in the desktop application, editor,
static publication, repository, logs, or browser environment variables.

## Readiness

Implementation and mocked/local tests are not deployment or live GitHub OAuth
verification. No App has been registered and no credentials or hosted service
have been created by this implementation. Before enabling a public deployment,
verify the documented S256 PKCE behavior in a live App flow, including rejection
of a missing or wrong verifier. GitHub’s [App token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
specifies S256 and requires the matching verifier when a challenge was sent. The broker relies on GitHub enforcing that binding, not merely accepting
a `code_verifier` parameter. If enforcement fails, do not deploy this design.

The local service must generate a fresh high-entropy verifier, use its S256
challenge in GitHub authorization, bind a fresh state to the pending connection,
validate the returned state, and send the code/verifier directly to this broker.
The editor must never see the token or verifier. This stateless broker cannot
validate local state or prove that the desktop application originated a request.
An Origin check prevents ordinary browser use; it is not native-client identity
or abuse protection. Set hosting rate limits and cost/traffic alerts before
public use. There is no in-memory rate limiter that incorrectly claims to cover
multiple serverless instances.

## GitHub App registration

Use a GitHub App, not an OAuth App. Configure this exact authorization callback:

`http://127.0.0.1:4318/github/callback`

Repository permissions for branch-and-Pages publication:

- Contents: read and write, for publishing the built static files.
- Pages: read and write, for Pages setup and deployment status.
- Administration: read and write, required alongside Pages write by GitHub’s
  [create/update Pages API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site).
  This is a broad permission. Limit installation to dedicated publication
  repositories; the implementation does not create repositories or otherwise
  use administration APIs.
- Metadata: read-only (GitHub's mandatory baseline).
- No account or organization permissions; no Actions or Workflows write access.
- Disable webhooks unless a separate, reviewed feature requires them.
- Enable expiring user authorization tokens. This implementation discards refresh
  tokens, so expired sessions require reconnection.
- Installation must use **Only select repositories**, choosing the publication
  repository. Installing an App does not authorize publishing: the existing
  explicit publication confirmation still applies.

The App must be installable by the intended pilot accounts. Registering a public
App, creating its secret, and expanding its installation permissions each remain
separate authorized operator actions. The broker uses the App **client ID** and
**client secret**, not its numeric App ID, private signing key, installation token,
or personal access token. No private key is needed for this exchange-only service.

## Runtime configuration

Server environment only:

- `GITHUB_APP_CLIENT_ID`: the GitHub App OAuth client ID.
- `GITHUB_APP_CLIENT_SECRET`: the matching OAuth client secret.
- `PORT`: optional local debug port, default `4320`.

The callback and GitHub token endpoint are fixed in code. Request bodies cannot
choose the destination, callback, client ID, or secret. There are no `VITE_`
secret variables. Invalid/missing credentials produce a safe `503` health response;
a successful health response validates configuration shape, not credential validity.

Local development, from the repository root, with credentials supplied securely
by the operator:

```sh
yarn tsc --build apps/github-auth-broker
yarn workspace @earth-stories/github-auth-broker start
yarn vitest run apps/github-auth-broker/src/broker.test.ts
```

The local entrypoint binds `127.0.0.1` only. It is not a public HTTP server setup.
Use HTTPS for the remotely configured broker URL; do not forward production codes
over cleartext HTTP. The HTTP loopback callback is distinct from that broker URL.

## Vercel deployment

Use `apps/github-auth-broker` as the Vercel project Root Directory, with framework
preset **Other**, no static output directory, and no frontend build command. The
Node TypeScript functions are `api/github/exchange.ts` and `api/health.ts`.
`vercel.json` rewrites `/health` to the health function and caps function duration
at 15 seconds. Use a supported Node 22+ runtime. Configure the two environment
variables as server secrets for the intended deployment environment only. Keep
preview deployments unconfigured unless specifically needed and authorized.

The adapters use named Web Request/Response method exports, avoiding Vercel's
legacy Node `request.body` helpers and their eager buffering. The exchange goes
directly through the shared Web handler, which enforces the 4 KiB request limit
before JSON parsing. The standalone local server uses a separate Node adapter.
Do not wrap these handlers in middleware that consumes the body. If porting to a
legacy Node/Next.js API route, explicitly preserve raw-body handling and verify
its size enforcement rather than assuming the platform parser is disabled.
Production deployment protection must permit the native local
service to call the exchange endpoint; do not disable unrelated access controls.
Any protection change needs its own approval. The deployment adapter/rewrite has
not been live-tested on Vercel.

Before pointing a desktop build at a hosted URL, verify:

1. HTTPS and `GET /health` succeed without exposing configuration.
2. The real native authorization flow completes for the selected repository.
3. A wrong/missing verifier, replayed code, and incorrect callback are rejected.
4. Cancellation, state mismatch, expiration, revocation, and reconnect are safe.
5. Expiring tokens cannot publish after expiry, and tokens never reach editor
   responses, request logs, analytics, crash reports, or persisted story files.
6. Enforce a distributed per-client/IP request limit and a global request/cost
   budget at the hosting edge before public access. Verify excess requests are
   rejected without calling GitHub. Choose limits for pilot traffic, account for
   shared networks, and monitor sanitized counts/statuses only. A forged Origin
   or a new instance must not bypass the limits. Request-duration limits, abuse
   alerts, and an operator responsible for responding must also be set.

## Protocol and hardening

`POST /api/github/exchange`, `Content-Type: application/json`:

```json
{
  "code": "authorization_code",
  "codeVerifier": "43-to-128-RFC7636-unreserved-characters"
}
```

Only those two keys are accepted. Input is bounded to 4 KiB. Requests with Origin,
Sec-Fetch-Site, compression, unsupported methods, or unexpected paths/query strings
are rejected. No CORS headers are emitted. Upstream exchange has a 10-second
fetch/body timeout, disallows redirects, and bounds responses to 16 KiB. All
responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

Successful response:

```json
{ "accessToken": "ghu_example", "expiresIn": 28800 }
```

`expiresIn` is omitted if GitHub omits expiration. No refresh token or other
upstream field is returned. The broker does not persist tokens, codes, verifiers,
secrets, sessions, or user identity and intentionally does not log request bodies
or upstream failures. Hosting operators must likewise disable sensitive body
logging. Failures return fixed messages, never GitHub response bodies or input.
