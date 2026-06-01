export interface BuildCardInput {
  id: string;
  type: "image" | "gif" | "video";
  uploaderName: string;
  uploaderEmail: string;
  mood?: string;
  caption?: string;
  thumbUrl: string;
  history: { approved: number; rejected: number; expired: number };
}

export interface SlackBlockKitMessage {
  text: string;
  blocks: Array<Record<string, unknown>>;
}

export function buildSubmissionCard(input: BuildCardInput): SlackBlockKitMessage {
  const moodLabel = input.mood ?? "—";
  const capLine = input.caption ? `*Caption:* ${escapeMrkdwn(input.caption)}` : "*Caption:* _(none)_";
  const headline = input.type === "video" ? "🆕 Video submission for review (video thumb shown)" : "🆕 New submission for review";

  return {
    text: headline,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${headline}*` } },
      { type: "image", image_url: input.thumbUrl, alt_text: `Submission ${input.id} thumbnail` },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Uploader:* ${escapeMrkdwn(input.uploaderName)} <${input.uploaderEmail}>`,
            `*Mood:* ${moodLabel}`,
            capLine,
            `*History:* ${input.history.approved} approved · ${input.history.rejected} rejected · ${input.history.expired} expired`
          ].join("\n")
        }
      },
      {
        type: "actions",
        elements: [
          { type: "button", style: "primary", text: { type: "plain_text", text: "✅ Approve" }, action_id: `approve_${input.id}`, value: input.id },
          { type: "button", style: "danger",  text: { type: "plain_text", text: "❌ Reject"  }, action_id: `reject_${input.id}`, value: input.id }
        ]
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "Reply in thread to edit caption before approving." }] }
    ]
  };
}

export interface BuildDecisionInput {
  id: string;
  decision: "approved" | "rejected";
  actor: string;
  decidedAtIso: string;
  liveInSeconds?: number;
}

export function buildDecisionUpdate(input: BuildDecisionInput): SlackBlockKitMessage {
  const actorShort = input.actor.split("@")[0];
  const time = input.decidedAtIso.slice(11, 16);
  const verb = input.decision === "approved" ? "✅ Approved" : "❌ Rejected";
  const tail = input.decision === "approved" ? ` — live in ~${input.liveInSeconds ?? 60}s` : "";
  const text = `${verb} by ${actorShort} at ${time}${tail}`;
  return {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${text}*` } }]
  };
}

function escapeMrkdwn(s: string): string {
  return s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
