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
