import { describe, expect, it } from "vitest";
import { deidentify, findLeaks, reidentify } from "../src/core/deidentify";
import { draftComment } from "../src/core/draft";
import { handleFor, parseMentions } from "../src/core/mentions";
import { toCsv } from "../src/core/csv";
import type { Student } from "../src/core/types";

const s = (id: number, first: string, last: string, pronouns: Student["pronouns"] = "they"): Student => ({
  id,
  classId: 1,
  firstName: first,
  lastName: last,
  pronouns,
});

const roster = [s(1, "Maya", "Okafor", "she"), s(2, "Leo", "Brandt", "he"), s(3, "Sam", "Reyes"), s(4, "Maya", "Lin", "she")];

describe("mentions", () => {
  it("uses first name when unique and adds last initial when not", () => {
    expect(handleFor(roster[1], roster)).toBe("Leo");
    expect(handleFor(roster[0], roster)).toBe("MayaO");
    expect(handleFor(roster[3], roster)).toBe("MayaL");
  });

  it("finds tagged students and strips the @ from the stored body", () => {
    const r = parseMentions("@Leo and @MayaO split the lab work evenly", roster);
    expect(r.studentIds).toEqual([2, 1]);
    expect(r.body).toBe("Leo and Maya split the lab work evenly");
  });

  it("is case-insensitive and ignores unknown handles", () => {
    const r = parseMentions("@leo helped @Nobody", roster);
    expect(r.studentIds).toEqual([2]);
    expect(r.body).toBe("Leo helped @Nobody");
  });

  it("does not double-count a repeated mention", () => {
    expect(parseMentions("@Sam then @Sam again", roster).studentIds).toEqual([3]);
  });
});

describe("deidentify", () => {
  const ctx = { roster, teacherName: "Ms. Patel", schoolName: "Lakeview Middle" };

  it("replaces the target with STUDENT_1 and other roster names with later tokens", () => {
    const r = deidentify("Leo Brandt asked Maya for help; Maya's answer was clear.", { ...ctx, targetId: 1 });
    expect(r.text).toBe("[STUDENT_2] asked [STUDENT_1] for help; [STUDENT_1]'s answer was clear.");
  });

  it("scrubs teacher, school, emails and phone numbers", () => {
    const r = deidentify(
      "Ms. Patel at Lakeview Middle emailed mom@example.com and called 214-555-0199.",
      { ...ctx, targetId: 2 },
    );
    expect(r.text).toBe("[TEACHER] at [SCHOOL] emailed [EMAIL] and called [PHONE].");
  });

  it("does not replace names inside other words", () => {
    const r = deidentify("Samantha is not Sam.", { ...ctx, targetId: 3 });
    expect(r.text).toBe("Samantha is not [STUDENT_1].");
  });

  it("round-trips the target name back in", () => {
    const r = deidentify("Maya Okafor led the group.", { ...ctx, targetId: 1 });
    expect(reidentify("[STUDENT_1] led well. [STUDENT_1]'s work shows it.", r.map)).toBe(
      "Maya led well. Maya's work shows it.",
    );
  });

  it("reports leaks when a roster name survives", () => {
    expect(findLeaks("[STUDENT_1] and Leo", roster)).toEqual(["Leo"]);
    expect(findLeaks("[STUDENT_1] did well", roster)).toEqual([]);
  });
});

describe("draftComment", () => {
  const obs = (body: string, tag: "strength" | "growth" | "habits" | "note", day: number) => ({
    id: day,
    body,
    tag,
    source: "typed" as const,
    createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
    studentIds: [1],
  });

  it("builds a comment from strengths and growth notes using the student's name and pronouns", () => {
    const text = draftComment(roster[0], [
      obs("Maya explained slope to her table without being asked", "strength", 3),
      obs("@Maya rushes through multi-step word problems", "growth", 5),
      obs("turned in every lab write-up on time", "habits", 7),
    ]);
    expect(text).toContain("Maya explained slope to her table without being asked.");
    expect(text).toContain("rushes through multi-step word problems");
    expect(text).toContain("She also turned in every lab write-up on time.");
  });

  it("uses the name instead of 'they' to avoid verb agreement errors", () => {
    const text = draftComment(roster[2], [obs("asks sharp questions in discussion", "strength", 1), obs("keeps a tidy notebook", "strength", 2)]);
    expect(text).not.toMatch(/They (asks|keeps)/);
    expect(text).toContain("Sam also keeps a tidy notebook.");
  });

  it("skips group notes where the student is the object, not the subject", () => {
    const grace = s(5, "Grace", "Oyelaran", "she");
    const text = draftComment(grace, [
      { ...obs("Priya helped Grace catch up on the slope notes", "strength", 1), studentIds: [5, 9] },
      { ...obs("Leo and Grace built the best number-line model", "strength", 2), studentIds: [5, 2] },
    ]);
    expect(text).not.toContain("Priya helped");
    expect(text).toContain("Leo and Grace built the best number-line model.");
  });

  it("returns null when there is nothing to write from", () => {
    expect(draftComment(roster[1], [])).toBeNull();
  });
});

describe("csv", () => {
  it("quotes fields with commas, quotes and newlines", () => {
    expect(toCsv([["a", 'say "hi"', "x,y"], ["line\nbreak", "", "z"]])).toBe('a,"say ""hi""","x,y"\r\n"line\nbreak",,z');
  });
});
