import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
export const issuer = "https://auth.openai.com";
const remoteKeys = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
  { timeoutDuration: 10000 },
);
export async function verifyIdentity(
  token: string,
  clientId: string,
  nonce: string | null,
  keys?: JSONWebKeySet,
) {
  const { payload } = await jwtVerify(
    token,
    keys ? createLocalJWKSet(keys) : remoteKeys,
    {
      issuer,
      audience: clientId,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp"],
      clockTolerance: 5,
    },
  );
  if (!payload.sub || (nonce !== null && payload.nonce !== nonce))
    throw new Error(
      "ChatGPT identity could not be verified. Please sign in again.",
    );
  return payload;
}
