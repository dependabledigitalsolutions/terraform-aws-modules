import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Module-scope so it's cached across warm invocations.
const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  exp: number;
  iat: number;
}

export async function verifyGoogleIdToken(idToken: string, audience: string): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience
  });
  const claims = payload as unknown as GoogleClaims;
  if (!claims.email_verified) {
    throw new Error("Google identity has email_verified=false");
  }
  return claims;
}
