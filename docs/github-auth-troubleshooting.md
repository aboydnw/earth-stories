# GitHub authentication from sandboxed agents

## Symptom

Running `gh auth status` inside a restricted agent sandbox may report:

```text
Failed to log in to github.com account …
The token … is invalid.
```

At the same time, `gh auth status` in the user's normal terminal reports a valid
active account and the expected token scopes.

## Cause

`gh auth status` does more than read the local credentials file: it contacts
GitHub to validate the token. When outbound network access is unavailable in the
agent sandbox, that validation can be surfaced as an invalid-token result. The
message alone does not prove that the stored token is expired or revoked.

This was confirmed on 2026-08-04: the restricted command reported an invalid
token, while the same command with approved network access immediately reported
the active `aboydnw` account and valid `repo` and `workflow` scopes.

## Required diagnostic sequence

Before asking the user to re-authenticate:

1. Confirm that the expected hosts file and account are present.
2. Ask the user to run `gh auth status` in their normal terminal, or compare
   against terminal output they already provided.
3. Retry `gh auth status` with approved network access when the agent environment
   supports escalation.
4. Only recommend `gh auth login` if the unrestricted check also fails or GitHub
   explicitly rejects the token.

## Guidance for future agents

Do not translate a sandbox-only `gh auth status` failure directly into “your
token has expired.” Report the evidence precisely:

> GitHub authentication could not be validated from the restricted execution
> environment. I need to retry with network access or compare against your
> terminal before concluding that the token is invalid.

Network validation and local credential discovery are separate checks. Treat
them separately in status updates and troubleshooting.
