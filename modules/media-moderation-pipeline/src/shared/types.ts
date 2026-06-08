export type ContentStatus = "transcoding" | "pending" | "approved" | "rejected" | "expired";
export type ContentType = "image" | "gif" | "video";

export interface ContentRow {
  PK: "CONTENT";
  SK: string;                         // "{iso}#{ulid}"
  id: string;                         // ulid
  type: ContentType;
  status: ContentStatus;
  mood?: string;
  uploaderSub: string;
  uploaderName: string;
  uploaderEmail: string;
  caption?: string;
  originalKey: string;
  publicKey?: string;
  thumbKey?: string;
  variants?: { w400?: string; w800?: string; w1600?: string };
  duration?: number;
  width?: number;
  height?: number;
  moderation?: {
    actor: string;
    decision: "approved" | "rejected";
    decidedAt: string;
    slackMessageTs?: string;
  };
  GSI1PK: string;                     // "STATUS#{status}"
  GSI1SK: string;                     // createdAt iso
  GSI2PK: string;                     // "USER#{uploaderSub}"
  GSI2SK: string;                     // createdAt iso
  createdAt: string;
  updatedAt: string;
}

export interface BanRow {
  PK: "BAN";
  SK: string;                         // google sub
  bannedAt: string;
  bannedBy: string;
  reason: string;
}

export interface UploadStashRow {
  PK: string;                         // "UPLOAD#{ulid}"
  SK: "STASH";
  uploaderSub: string;
  uploaderName: string;
  uploaderEmail: string;
  mood?: string;
  caption?: string;
  ttl: number;                        // unix epoch
}

// Aggregated reads from configured Arsenal RSS feeds. Populated by the
// scheduled fetch-reads Lambda; surfaced by list-reads. Anonymous,
// link-card UX — no on-site engagement.
export interface ReadRow {
  PK: "READ";
  SK: string;                         // "{publishedAtIso}#{urlHash}" — newest-first via descending Query
  url: string;
  source: string;                     // human label, e.g. "Arseblog"
  title: string;
  summary?: string;
  image?: string;                     // first <img> extracted from the description, when present
  publishedAt: string;                // iso
  fetchedAt: string;                  // iso
  ttl: number;                        // unix epoch — auto-prune older entries
}
