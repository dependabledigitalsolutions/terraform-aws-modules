import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySlackSignature } from "./slack";

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzz77789";

function sign(body: string, ts: string): string {
  const base = `v0:${ts}:${body}`;
  return `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
}

describe("verifySlackSignature", () => {
  it("returns true for a valid signature within window", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
    const sig = sign(body, ts);
    expect(verifySlackSignature({ body, timestamp: ts, signature: sig, signingSecret: SIGNING_SECRET })).toBe(true);
  });

  it("returns false for a tampered body", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "payload=foo";
    const sig = sign(body, ts);
    expect(verifySlackSignature({ body: "payload=bar", timestamp: ts, signature: sig, signingSecret: SIGNING_SECRET })).toBe(false);
  });

  it("returns false for a timestamp older than 5 minutes", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 6);
    const body = "x";
    const sig = sign(body, ts);
    expect(verifySlackSignature({ body, timestamp: ts, signature: sig, signingSecret: SIGNING_SECRET })).toBe(false);
  });
});
