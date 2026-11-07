# GitHub App auth broker

A separate, server-only OAuth code exchange service for Earth Stories.

Read [deployment, security assumptions, App permissions, and verification gates](../../docs/github-auth-broker.md)
before configuring or hosting it. The GitHub App client secret belongs only in
this service's server environment, never in a desktop build or editor bundle.

From the repository root:

```sh
yarn tsc --build apps/github-auth-broker
yarn vitest run apps/github-auth-broker/src/broker.test.ts
yarn workspace @earth-stories/github-auth-broker start
```

`GET /health` reports configuration readiness. `POST /api/github/exchange`
accepts only a code and RFC7636 verifier. Local startup uses loopback port 4320;
Vercel adapters live under `api/`. Local tests do not establish live OAuth or
hosted deployment readiness.
