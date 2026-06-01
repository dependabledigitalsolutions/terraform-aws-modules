import { describe, it, expect } from "vitest";
import { detectMime } from "./magic-bytes";

describe("detectMime", () => {
  it("detects JPEG from FF D8 FF", () => {
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
  });
  it("detects PNG from 89 50 4E 47", () => {
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });
  it("detects GIF from GIF87a/GIF89a", () => {
    expect(detectMime(Buffer.from("GIF89a", "ascii"))).toBe("image/gif");
  });
  it("detects WebP from RIFF....WEBP", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBPVP8 ", "ascii")
    ]);
    expect(detectMime(buf)).toBe("image/webp");
  });
  it("detects MP4 from ftyp box", () => {
    const buf = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from("isom", "ascii")
    ]);
    expect(detectMime(buf)).toBe("video/mp4");
  });
  it("detects QuickTime from ftypqt", () => {
    const buf = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from("qt  ", "ascii")
    ]);
    expect(detectMime(buf)).toBe("video/quicktime");
  });
  it("returns null for unknown bytes", () => {
    expect(detectMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
