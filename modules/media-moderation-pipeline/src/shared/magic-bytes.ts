export type DetectedMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime";

export function detectMime(head: Buffer): DetectedMime | null {
  if (head.length < 4) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  const ascii6 = head.subarray(0, 6).toString("ascii");
  if (ascii6 === "GIF87a" || ascii6 === "GIF89a") return "image/gif";
  if (head.length >= 12 && head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (head.length >= 12 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = head.subarray(8, 12).toString("ascii");
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}
