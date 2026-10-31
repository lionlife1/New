import initSqlJs, { type SqlJsStatic } from "sql.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Repo } from "../src/db/repo";

let SQL: SqlJsStatic;
let repo: Repo;
let changes = 0;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  changes = 0;
  repo = Repo.open(SQL, null, () => changes++);
});

describe("Repo", () => {
  it("stores a group note once and links it to each student", () => {
    const c = repo.addClass("Period 2 Algebra");
    const a = repo.addStudent({ classId: c, firstName: "Maya", lastName: "Okafor", pronouns: "she" });
    const b = repo.addStudent({ classId: c, firstName: "Leo", lastName: "Brandt", pronouns: "he" });
    repo.addObservation({ body: "Maya and Leo split the lab evenly", tag: "habits", source: "typed", studentIds: [a, b] });

    expect(repo.stats().observations).toBe(1);
    expect(repo.listObservations({ studentId: a })[0].studentIds.sort()).toEqual([a, b].sort());
    expect(repo.noteCounts(c).get(b)).toBe(1);
  });

  it("rejects a note with no students and rolls back", () => {
    expect(() => repo.addObservation({ body: "x", tag: "note", source: "typed", studentIds: [] })).toThrow();
    expect(repo.stats().observations).toBe(0);
  });

  it("rolls back a failed write and does not report a change", () => {
    const before = changes;
    expect(() => repo.addStudent({ classId: 999, firstName: "Ghost", lastName: "", pronouns: "they" })).toThrow();
    expect(changes).toBe(before);
    expect(repo.stats().students).toBe(0);
  });

  it("deleting a student removes notes only about them but keeps shared ones", () => {
    const c = repo.addClass("P3");
    const a = repo.addStudent({ classId: c, firstName: "A", lastName: "One", pronouns: "they" });
    const b = repo.addStudent({ classId: c, firstName: "B", lastName: "Two", pronouns: "they" });
    repo.addObservation({ body: "solo", tag: "note", source: "typed", studentIds: [a] });
    repo.addObservation({ body: "pair", tag: "note", source: "typed", studentIds: [a, b] });
    repo.deleteStudent(a);
    expect(repo.listObservations().map((o) => o.body)).toEqual(["pair"]);
  });

  it("keeps comment history and returns the newest as current", () => {
    const c = repo.addClass("P4");
    const a = repo.addStudent({ classId: c, firstName: "A", lastName: "One", pronouns: "they" });
    repo.saveComment({ studentId: a, body: "v1", method: "starter" });
    const v2 = repo.saveComment({ studentId: a, body: "v2", method: "edited" });
    repo.setCommentStatus(v2, "final");
    expect(repo.currentComment(a)).toMatchObject({ body: "v2", status: "final" });
    expect(repo.commentHistory(a)).toHaveLength(2);
    expect(repo.currentComments().get(a)?.body).toBe("v2");
  });

  it("survives an export/import round trip", () => {
    const c = repo.addClass("P5");
    repo.addStudent({ classId: c, firstName: "Rae", lastName: "Kim", pronouns: "she" });
    repo.setSetting("teacherName", "Ms. Patel");
    const copy = Repo.open(SQL, repo.export());
    expect(copy.listStudents()[0].firstName).toBe("Rae");
    expect(copy.getSetting("teacherName")).toBe("Ms. Patel");
  });
});

describe("Repo.deleteClass", () => {
  it("removes the class's students and their notes", () => {
    const c = repo.addClass("Gone");
    const a = repo.addStudent({ classId: c, firstName: "A", lastName: "", pronouns: "they" });
    repo.addObservation({ body: "x", tag: "note", source: "typed", studentIds: [a] });
    repo.deleteClass(c);
    expect(repo.stats()).toMatchObject({ classes: 0, students: 0, observations: 0 });
  });
});
