// cron-cleanup is intentionally a deferred stub for v1.
//
// Future scope: nightly EventBridge schedule walks CONTENT rows with
// status=pending whose pending S3 object has been deleted by the bucket's
// 7-day lifecycle policy, and marks each as status=expired. This is
// belt-and-braces — the S3 lifecycle already removes the object, so the
// DDB row's mismatched state is a cosmetic issue only at v1.
//
// Wiring (Terraform): EventBridge cron rule + permissions + this Lambda.
// NOT wired up in the module's eventbridge.tf for v1.

export async function handler(): Promise<{ status: "deferred" }> {
  return { status: "deferred" };
}
