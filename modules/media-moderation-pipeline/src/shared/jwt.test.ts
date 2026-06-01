import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyGoogleIdToken, type GoogleClaims } from "./jwt";

const REAL_AUD = "test-client-id.apps.googleusercontent.com";

const fakeClaims: GoogleClaims = {
  iss: "https://accounts.google.com",
  aud: REAL_AUD,
  sub: "1234567890",
  email: "jane@gmail.com",
  email_verified: true,
  name: "Jane Smith",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000)
};

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(async (_token: string, _jwks: unknown, opts: { audience?: string }) => {
    if (opts.audience && opts.audience !== REAL_AUD) {
      throw new Error("audience mismatch");
    }
    return { payload: fakeClaims };
  })
}));

describe("verifyGoogleIdToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns claims when token is valid and audience matches", async () => {
    const claims = await verifyGoogleIdToken("any.jwt.string", REAL_AUD);
    expect(claims.sub).toBe("1234567890");
    expect(claims.email).toBe("jane@gmail.com");
  });

  it("throws when audience mismatch", async () => {
    await expect(
      verifyGoogleIdToken("any.jwt.string", "wrong-aud.apps.googleusercontent.com")
    ).rejects.toThrow();
  });

  it("throws when email is not verified", async () => {
    const { jwtVerify } = await import("jose");
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      payload: { ...fakeClaims, email_verified: false }
    });
    await expect(verifyGoogleIdToken("x", REAL_AUD)).rejects.toThrow(/email_verified/);
  });
});
