import { escapeRegExp, wordRe } from "./text";
import type { Student } from "./types";

export interface DeidContext {
  roster: Student[];
  targetId: number;
  teacherName?: string;
  schoolName?: string;
}

export interface DeidResult {
  text: string;
  /** token -> the first name to put back */
  map: Record<string, string>;
  replaced: { token: string; count: number }[];
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}\b/g;

/**
 * Replace every identifying string we know about with a stable token.
 * The student the comment is about is always [STUDENT_1]; anyone else
 * from the roster gets [STUDENT_2], [STUDENT_3]... in order of appearance.
 */
export function deidentify(input: string, ctx: DeidContext): DeidResult {
  const counts = new Map<string, number>();
  const bump = (t: string) => counts.set(t, (counts.get(t) ?? 0) + 1);

  let text = input.replace(EMAIL, () => (bump("[EMAIL]"), "[EMAIL]"));
  text = text.replace(PHONE, () => (bump("[PHONE]"), "[PHONE]"));

  const fixed: [string, string][] = [];
  if (ctx.schoolName?.trim()) fixed.push([ctx.schoolName.trim(), "[SCHOOL]"]);
  if (ctx.teacherName?.trim()) {
    const t = ctx.teacherName.trim();
    fixed.push([t, "[TEACHER]"]);
    const last = t.split(/\s+/).pop()!;
    if (last !== t && last.length > 2) fixed.push([last, "[TEACHER]"]);
  }

  // Candidate strings -> student. Bare first names shared by two students resolve to the target.
  const target = ctx.roster.find((s) => s.id === ctx.targetId);
  const candidates = new Map<string, number>();
  const add = (name: string, id: number) => {
    const key = name.trim().toLowerCase();
    if (key.length < 2) return;
    if (!candidates.has(key) || id === ctx.targetId) candidates.set(key, id);
  };
  for (const s of ctx.roster) {
    add(`${s.firstName} ${s.lastName}`, s.id);
    add(s.lastName, s.id);
    add(s.firstName, s.id);
  }
  if (target) add(target.firstName, target.id);

  const tokenFor = new Map<number, string>();
  if (target) tokenFor.set(target.id, "[STUDENT_1]");
  const map: Record<string, string> = target ? { "[STUDENT_1]": target.firstName } : {};

  const alternatives = [
    ...fixed.map(([s]) => s),
    ...candidates.keys(),
  ].sort((a, b) => b.length - a.length);

  if (alternatives.length) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])(${alternatives.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
      "giu",
    );
    text = text.replace(re, (match: string) => {
      const lower = match.toLowerCase();
      const f = fixed.find(([s]) => s.toLowerCase() === lower);
      if (f) return bump(f[1]), f[1];
      const id = candidates.get(lower)!;
      let token = tokenFor.get(id);
      if (!token) {
        token = `[STUDENT_${tokenFor.size + 1}]`;
        tokenFor.set(id, token);
        map[token] = ctx.roster.find((s) => s.id === id)!.firstName;
      }
      bump(token);
      return token;
    });
  }

  return {
    text,
    map,
    replaced: [...counts.entries()].map(([token, count]) => ({ token, count })),
  };
}

export function reidentify(text: string, map: Record<string, string>): string {
  return text.replace(/\[STUDENT_\d+\]/g, (t) => map[t] ?? t);
}

/** Any roster name still present in text that is about to leave the device. */
export function findLeaks(text: string, roster: Student[]): string[] {
  const found = new Set<string>();
  for (const s of roster) {
    for (const n of [s.firstName, s.lastName]) {
      if (n.length >= 2 && wordRe(n).test(text)) found.add(n);
    }
  }
  return [...found];
}
