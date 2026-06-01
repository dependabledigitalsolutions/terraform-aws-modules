import { describe, it, expect } from "vitest";
import { buildSubmissionCard, buildDecisionUpdate } from "./slack-card";

describe("buildSubmissionCard", () => {
  it("produces a Block Kit message with approve + reject buttons", () => {
    const card = buildSubmissionCard({
      id: "01HXYZ",
      type: "image",
      uploaderName: "Jane Smith",
      uploaderEmail: "jane@gmail.com",
      mood: "trophy",
      caption: "Cup celebration",
      thumbUrl: "https://cdn.example.com/01HXYZ/thumb.webp",
      history: { approved: 12, rejected: 1, expired: 0 }
    });
    expect(card.blocks.some(b => b.type === "image")).toBe(true);
    const actions = card.blocks.find(b => b.type === "actions") as { elements: Array<{ action_id: string }> };
    expect(actions.elements.map(e => e.action_id)).toEqual(["approve_01HXYZ", "reject_01HXYZ"]);
  });

  it("uses a video thumb fallback for videos", () => {
    const card = buildSubmissionCard({
      id: "01VID",
      type: "video",
      uploaderName: "Sam",
      uploaderEmail: "sam@gmail.com",
      mood: "goals",
      caption: undefined,
      thumbUrl: "https://cdn.example.com/01VID/thumb.webp",
      history: { approved: 0, rejected: 0, expired: 0 }
    });
    const textBlocks = card.blocks.filter(b => b.type === "section");
    expect(JSON.stringify(textBlocks)).toMatch(/video thumb/i);
  });
});

describe("buildDecisionUpdate", () => {
  it("renders an approved-by line with timestamp", () => {
    const msg = buildDecisionUpdate({
      id: "01HXYZ",
      decision: "approved",
      actor: "emmanuel.pius-ogiji@askattest.com",
      decidedAtIso: "2026-06-01T14:23:00Z"
    });
    expect(msg.text).toMatch(/Approved by emmanuel/);
    expect(msg.text).toMatch(/14:23/);
  });
});
