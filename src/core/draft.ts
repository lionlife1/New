import { escapeRegExp } from "./text";
import type { Observation, Pronouns, Student } from "./types";

const SUBJECT: Record<Pronouns, string> = { she: "She", he: "He", they: "They" };

/**
 * Turn a raw note into a clause. Notes are usually fragments ("rushes through
 * word problems") or start with the student's name. Returns either a verb
 * phrase that needs a subject, or a sentence that stands on its own.
 */
export function toClause(note: string, student: Student): { text: string; needsSubject: boolean } {
  let t = note.trim().replace(/^@/, "").replace(/[.!\s]+$/, "");
  const name = new RegExp(
    `^(${escapeRegExp(student.firstName)}(\\s+${escapeRegExp(student.lastName)})?|she|he|they)\\b\\s*`,
    "i",
  );
  if (name.test(t)) return { text: t.replace(name, ""), needsSubject: true };
  const first = t.charAt(0);
  if (first && first === first.toLowerCase() && first !== first.toUpperCase()) {
    return { text: t, needsSubject: true };
  }
  return { text: t, needsSubject: false };
}

/**
 * For a note about several students, is this student part of the subject?
 * "Leo and Grace built..." -> yes for Grace. "Priya helped Grace..." -> no.
 * The subject is the run of capitalised words, "and", "&" and commas at the start.
 */
export function isSubjectOf(note: string, student: Student): boolean {
  const lead: string[] = [];
  for (const w of note.replace(/^@/, "").split(/[\s,]+/)) {
    const bare = w.replace(/^@/, "");
    if (/^(and|&)$/i.test(bare) || /^\p{Lu}/u.test(bare)) lead.push(bare.replace(/['’]s$/, ""));
    else break;
  }
  return lead.some((w) => w.toLowerCase() === student.firstName.toLowerCase());
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + ".";

/**
 * A plain starter comment assembled only from the teacher's own notes.
 * Deliberately conservative: it rearranges what the teacher wrote and adds
 * no claims of its own beyond a short closing line.
 */
export function draftComment(student: Student, observations: Observation[]): string | null {
  const relevant = observations.filter((o) => o.studentIds.length <= 1 || isSubjectOf(o.body, student));
  const recent = [...relevant].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pick = (tag: Observation["tag"], n: number) =>
    recent.filter((o) => o.tag === tag).slice(0, n).reverse();

  const positives = [...pick("strength", 3), ...pick("habits", 1)];
  const growth = pick("growth", 2);
  if (positives.length === 0 && growth.length === 0) return null;

  const name = student.firstName;
  // "They asks" is wrong and "they ask" needs verb surgery, so use the name instead.
  const subj = student.pronouns === "they" ? name : SUBJECT[student.pronouns];

  const parts: string[] = [];
  positives.forEach((o, i) => {
    const c = toClause(o.body, student);
    if (!c.needsSubject) return parts.push(sentence(c.text));
    if (i === 0) parts.push(sentence(`${name} ${c.text}`));
    else if (i === 1) parts.push(sentence(`${subj} also ${c.text}`));
    else parts.push(sentence(`In addition, ${subj === name ? name : subj.toLowerCase()} ${c.text}`));
  });

  growth.forEach((o, i) => {
    const c = toClause(o.body, student);
    const lead = i === 0 ? "One thing to work on next" : "Another goal";
    const body = c.needsSubject ? `${i === 0 && positives.length === 0 ? name : subj === name ? name : subj.toLowerCase()} ${c.text}` : c.text.charAt(0).toLowerCase() + c.text.slice(1);
    parts.push(`${lead}: ${body}.`);
  });

  parts.push(
    growth.length
      ? `With steady attention to ${growth.length > 1 ? "these" : "this"}, ${name} is well placed for the rest of the year.`
      : `${name} should be proud of this term's work.`,
  );
  return parts.join(" ");
}
