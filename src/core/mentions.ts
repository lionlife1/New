import type { Student } from "./types";

/** The @handle a teacher types for a student: first name, plus last initial if the first name is shared. */
export function handleFor(student: Student, roster: Student[]): string {
  const shared = roster.some(
    (o) => o.id !== student.id && o.firstName.toLowerCase() === student.firstName.toLowerCase(),
  );
  const base = student.firstName.replace(/\s+/g, "");
  return shared ? base + student.lastName.charAt(0).toUpperCase() : base;
}

export interface ParsedNote {
  body: string;
  studentIds: number[];
}

/** Pull @handles out of a note. Known handles become the student's first name in the stored text. */
export function parseMentions(text: string, roster: Student[]): ParsedNote {
  const byHandle = new Map(roster.map((s) => [handleFor(s, roster).toLowerCase(), s]));
  const ids: number[] = [];
  const body = text.replace(/@([\p{L}\p{N}'-]+)/gu, (match, handle: string) => {
    const student = byHandle.get(handle.toLowerCase());
    if (!student) return match;
    if (!ids.includes(student.id)) ids.push(student.id);
    return student.firstName;
  });
  return { body: body.replace(/\s+/g, " ").trim(), studentIds: ids };
}

/** The partial handle being typed at the cursor, if any. */
export function activeMention(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = /(^|\s)@([\p{L}\p{N}'-]*)$/u.exec(before);
  if (!m) return null;
  return { start: cursor - m[2].length - 1, query: m[2] };
}
