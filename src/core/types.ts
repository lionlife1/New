export type Pronouns = "she" | "he" | "they";
export type Tag = "strength" | "growth" | "habits" | "note";
export type Source = "typed" | "dictated";

export interface ClassRoom {
  id: number;
  name: string;
}

export interface Student {
  id: number;
  classId: number;
  firstName: string;
  lastName: string;
  pronouns: Pronouns;
}

export interface Observation {
  id: number;
  body: string;
  tag: Tag;
  source: Source;
  createdAt: string;
  studentIds: number[];
}

export interface Comment {
  id: number;
  studentId: number;
  body: string;
  method: "starter" | "claude" | "edited";
  status: "draft" | "final";
  createdAt: string;
}

export interface OutboundRecord {
  id: number;
  sentAt: string;
  studentToken: string;
  payload: string;
}

export const TAG_LABEL: Record<Tag, string> = {
  strength: "Strength",
  growth: "Growth area",
  habits: "Work habits",
  note: "Note",
};
