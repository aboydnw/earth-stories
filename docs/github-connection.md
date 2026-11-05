# GitHub connection and publishing

The publication workshop connects a GitHub App separately from publishing. The
selected-repository flow replaces the previously implicit OAuth device/CLI flow
in the running service. Existing publication builds, ZIP downloads, Finder reveal,
and hosting guidance remain available without a GitHub account.

## Author workflow

1. Choose **Connect GitHub**, then **Continue on GitHub**. Authorize the App in the
   system browser and return to Earth Stories. Connecting alone uploads nothing.
2. Use **Install / select repositories**, choose **Only select repositories**, and
   select a dedicated public publication repository. If needed, create an empty
   repository on GitHub first. GitHub requires Contents, Pages, and Administration
   write permission to publish and configure Pages automatically. Administration
   is broad: install only on dedicated publication repositories. Earth Stories
   does not create repositories automatically.
3. Choose **Refresh repositories**, then select the publication repository.
   Only writable, public, enabled, non-archived repositories accessible to this
   App through a selected-repositories installation are offered. The signed-in
   user must also be an administrator, maintainer, or have permission to manage
   Pages settings. Organizations are supported when the signed-in user and the
   App both have access. Organization approval policies can require a separate
   owner approval on GitHub.
4. Review the public destination and **Publish to the web**. This builds and
   uploads the compiled publication only, never the editable story, source
   project folder, local credentials, or backups. The dedicated `gh-pages` branch
   is replaced with the latest release; unrelated existing repositories are
   rejected rather than overwritten. Empty repositories receive a small project
   seed on their default branch before the publication branch is created.
5. Later publishes reuse the recorded repository ID and URL. A removed,
   transferred, renamed, or recreated destination is not silently substituted.
   Legacy records without an ID require an explicit selection and conservative
   ownership checks. The current release can still be downloaded locally if
   publishing is blocked.

GitHub Pages output is public. Private repositories are deliberately excluded
from this pilot path, irrespective of the account's paid-plan capabilities.
Disconnecting clears Earth Stories' local stored credential. It neither deletes
the hosted story nor uninstalls/revokes the App on GitHub. The installation link
opens GitHub's controls for changing selected repositories or removing access.

## Authentication boundary

The local service listens temporarily on `127.0.0.1:4318` for
`/github/callback`; the desktop service's normal port remains separate. A fresh
256-bit state and S256 PKCE challenge bind each connection attempt. Only a
matching, single-use callback may initiate the exchange. The callback listener
closes after completion, cancellation, failure, timeout, or service shutdown.
The connection window is ten minutes. A port conflict is reported explicitly.
Repeated clicks reuse one pending connection; late replies cannot complete a
canceled or newer connection. Closing the workshop cancels a pending connection.

The authorization code and PKCE verifier travel from the local service to a
separate HTTPS broker. The App client secret exists only at that broker; no
private App signing key is required. The editor receives account/status/link
metadata only. It never receives an access token, refresh token, client secret,
or PKCE verifier. The callback's URL code and state are not copied into logs or
projects. The browser callback response disables caching and referrers.

The broker returns only the expiring user access token and its lifetime. Refresh
tokens are discarded, so expiration requires reconnecting. The local service
verifies the account before saving the access token. The existing desktop
credential store encrypts it using OS-protected storage where available; the
standalone service uses its private credential file outside project folders.
Existing documented plaintext fallback/platform limitations still apply.
Old broad OAuth and GitHub CLI credentials are not silently reused or deleted.

Repository access is queried through `/user/installations` and the matching
App's installation repositories, with locally constructed pagination URLs. The
server derives owner/name from the selected numeric repository ID, checks access
before publication and each major remote stage, and checks the local connection
before every write. GitHub enforces token permissions on every API request.
Responses and error messages exposed to the editor exclude credentials and raw
authentication errors.

## Maintainer setup

No App registration, credentials, deployment, installation, or live publication
is supplied by this code change. See [the broker deployment guide](github-auth-broker.md)
for server-only variables, permissions, Vercel adapters, and required live gates.
The App must use Contents, Pages, and Administration read/write, plus Metadata read, with
no account/organization permissions, webhooks, or App private key for this flow.
GitHub’s [Pages REST API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)
requires both Pages and Administration write for automatic creation and updates.
The application uses Administration only for Pages configuration; the permission
itself is broader, so selected dedicated repositories are required. This flow never requests broad OAuth `repo` scopes.

Configure these **public**, non-secret values before building the local-service
bundle used by a desktop release:

```sh
EARTH_STORIES_GITHUB_APP_CLIENT_ID=Iv1.public_client_id
EARTH_STORIES_GITHUB_APP_SLUG=earth-stories
EARTH_STORIES_GITHUB_BROKER_URL=https://chosen-broker.example/api/github/exchange
```

The local-service build embeds these public values. Source-development service
runs may read the same variables directly, and tests/embedders can supply the
`LocalServiceConfig.githubApp` object. A release with no configured values shows
an unavailable connection state rather than asking every author to register an
App. Never add `GITHUB_APP_CLIENT_SECRET` to these public build settings, a Vite
variable, or desktop packaging. The service build does not embed that secret.

Before calling the integration release-ready, verify on a real target machine:

- The production broker and App agree on client ID and the exact loopback callback.
- GitHub enforces S256: wrong/missing verifier and replayed code must fail.
- Selected personal and intended organization repositories appear as expected.
- Create the first Pages publication in a disposable authorized repository,
  then update it without changing the address; verify hosted assets and ranges.
- Cancel, close, reopen, deny authorization, revoke installation access, expire
  the user token, and reconnect. No stale result may save or publish afterward.
- An unrelated or recreated repository is refused, secrets remain outside the
  project/publication, and the release bundle includes only public config.
- Hosted broker rate limits, cost alerts, operator ownership, privacy/logging,
  and commercial-plan eligibility have been reviewed.

GitHub’s [App user-token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
documents S256 PKCE, required matching verifier, and server-side client secret.

Mocked tests and successful local builds are not evidence that those live gates
passed. This remains a pilot integration until they do.
