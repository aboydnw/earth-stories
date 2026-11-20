import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { expect, it } from "vitest";
import { verifyIdentity } from "./identity.js";
it("validates signature, issuer, audience, expiry, nonce and subject", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };
  const sign = (overrides: Record<string, unknown> = {}) =>
    new SignJWT({
      sub: "person",
      nonce: "nonce",
      email: "author@example.org",
      iss: "https://auth.openai.com",
      aud: "oaiapp_test",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(privateKey);
  const verify = (token: string) =>
    verifyIdentity(token, "oaiapp_test", "nonce", { keys: [jwk] });
  expect((await verify(await sign())).sub).toBe("person");
  for (const overrides of [
    { nonce: "other" },
    { aud: "other" },
    { iss: "https://evil.example" },
    { exp: 0 },
    { sub: "" },
  ])
    await expect(verify(await sign(overrides))).rejects.toThrow();
  await expect(
    verify((await sign()).slice(0, -8) + "tampered"),
  ).rejects.toThrow();
});
