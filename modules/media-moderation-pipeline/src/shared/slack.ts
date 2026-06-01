import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifySlackSigInput {
  body: string;
  timestamp: string;
  signature: string;
  signingSecret: string;
  /** Override for testing time-window checks. Default = now() in seconds. */
  nowSeconds?: number;
  /** Maximum allowed clock skew, in seconds. Default = 300. */
  toleranceSeconds?: number;
}

export function verifySlackSignature(input: VerifySlackSigInput): boolean {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > tolerance) return false;

  const base = `v0:${input.timestamp}:${input.body}`;
  const computed = `v0=${createHmac("sha256", input.signingSecret).update(base).digest("hex")}`;
  const a = Buffer.from(computed);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
