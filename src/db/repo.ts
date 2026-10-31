import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import { SCHEMA } from "./schema";
import type { ClassRoom, Comment, Observation, OutboundRecord, Source, Student, Tag } from "../core/types";

type Row = Record<string, SqlValue>;

/** Thin, typed wrapper over a sql.js database. Every write calls onChange so the caller can persist. */
export class Repo {
  constructor(
    private db: Database,
    private onChange: () => void = () => {},
  ) {
    db.exec(SCHEMA);
  }

  static open(SQL: SqlJsStatic, bytes?: Uint8Array | null, onChange?: () => void) {
    return new Repo(bytes ? new SQL.Database(bytes) : new SQL.Database(), onChange);
  }

  private all(sql: string, params: SqlValue[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  private run(sql: string, params: SqlValue[] = []): number {
    this.db.run(sql, params);
    return Number(this.all("SELECT last_insert_rowid() AS id")[0].id);
  }

  private write<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      this.onChange();
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // classes
  listClasses(): ClassRoom[] {
    return this.all("SELECT id, name FROM classes ORDER BY id").map((r) => ({ id: Number(r.id), name: String(r.name) }));
  }
  addClass(name: string): number {
    return this.write(() => this.run("INSERT INTO classes (name) VALUES (?)", [name.trim()]));
  }
  renameClass(id: number, name: string) {
    this.write(() => this.run("UPDATE classes SET name = ? WHERE id = ?", [name.trim(), id]));
  }
  deleteClass(id: number) {
    this.write(() => {
      this.run("DELETE FROM classes WHERE id = ?", [id]);
      this.run("DELETE FROM observations WHERE id NOT IN (SELECT observation_id FROM observation_students)");
    });
  }

  // students
  listStudents(classId?: number): Student[] {
    const rows = classId == null
      ? this.all("SELECT * FROM students ORDER BY first_name, last_name")
      : this.all("SELECT * FROM students WHERE class_id = ? ORDER BY first_name, last_name", [classId]);
    return rows.map(toStudent);
  }
  getStudent(id: number): Student | null {
    const r = this.all("SELECT * FROM students WHERE id = ?", [id])[0];
    return r ? toStudent(r) : null;
  }
  addStudent(s: Omit<Student, "id">): number {
    return this.write(() =>
      this.run("INSERT INTO students (class_id, first_name, last_name, pronouns) VALUES (?,?,?,?)", [
        s.classId, s.firstName.trim(), s.lastName.trim(), s.pronouns,
      ]),
    );
  }
  updateStudent(s: Student) {
    this.write(() =>
      this.run("UPDATE students SET first_name = ?, last_name = ?, pronouns = ?, class_id = ? WHERE id = ?", [
        s.firstName.trim(), s.lastName.trim(), s.pronouns, s.classId, s.id,
      ]),
    );
  }
  deleteStudent(id: number) {
    this.write(() => {
      this.run("DELETE FROM students WHERE id = ?", [id]);
      // Notes that were only about this student go too.
      this.run("DELETE FROM observations WHERE id NOT IN (SELECT observation_id FROM observation_students)");
    });
  }

  /** Note counts per student, including those with zero. */
  noteCounts(classId?: number): Map<number, number> {
    const rows = this.all(
      `SELECT s.id, COUNT(os.observation_id) AS n
         FROM students s LEFT JOIN observation_students os ON os.student_id = s.id
        ${classId == null ? "" : "WHERE s.class_id = ?"}
        GROUP BY s.id`,
      classId == null ? [] : [classId],
    );
    return new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
  }

  // observations
  addObservation(o: { body: string; tag: Tag; source: Source; studentIds: number[]; createdAt?: string }): number {
    if (!o.studentIds.length) throw new Error("A note needs at least one student.");
    return this.write(() => {
      const id = o.createdAt
        ? this.run("INSERT INTO observations (body, tag, source, created_at) VALUES (?,?,?,?)", [o.body, o.tag, o.source, o.createdAt])
        : this.run("INSERT INTO observations (body, tag, source) VALUES (?,?,?)", [o.body, o.tag, o.source]);
      for (const sid of o.studentIds) {
        this.db.run("INSERT INTO observation_students (observation_id, student_id) VALUES (?,?)", [id, sid]);
      }
      return id;
    });
  }
  listObservations(opts: { studentId?: number; limit?: number } = {}): Observation[] {
    const where = opts.studentId == null ? "" : "WHERE o.id IN (SELECT observation_id FROM observation_students WHERE student_id = ?)";
    const params: SqlValue[] = opts.studentId == null ? [] : [opts.studentId];
    const rows = this.all(
      `SELECT o.*, (SELECT group_concat(student_id) FROM observation_students WHERE observation_id = o.id) AS sids
         FROM observations o ${where}
        ORDER BY o.created_at DESC, o.id DESC
        ${opts.limit ? `LIMIT ${Math.floor(opts.limit)}` : ""}`,
      params,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      body: String(r.body),
      tag: r.tag as Tag,
      source: r.source as Source,
      createdAt: String(r.created_at),
      studentIds: String(r.sids ?? "").split(",").filter(Boolean).map(Number),
    }));
  }
  updateObservationTag(id: number, tag: Tag) {
    this.write(() => this.run("UPDATE observations SET tag = ? WHERE id = ?", [tag, id]));
  }
  deleteObservation(id: number) {
    this.write(() => this.run("DELETE FROM observations WHERE id = ?", [id]));
  }

  // comments
  saveComment(c: { studentId: number; body: string; method: Comment["method"]; status?: Comment["status"] }): number {
    return this.write(() =>
      this.run("INSERT INTO comments (student_id, body, method, status) VALUES (?,?,?,?)", [
        c.studentId, c.body, c.method, c.status ?? "draft",
      ]),
    );
  }
  setCommentStatus(id: number, status: Comment["status"]) {
    this.write(() => this.run("UPDATE comments SET status = ? WHERE id = ?", [status, id]));
  }
  currentComment(studentId: number): Comment | null {
    const r = this.all("SELECT * FROM comments WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentId])[0];
    return r ? toComment(r) : null;
  }
  commentHistory(studentId: number): Comment[] {
    return this.all("SELECT * FROM comments WHERE student_id = ? ORDER BY id DESC", [studentId]).map(toComment);
  }
  currentComments(): Map<number, Comment> {
    const rows = this.all(
      "SELECT c.* FROM comments c JOIN (SELECT student_id, MAX(id) AS id FROM comments GROUP BY student_id) m ON m.id = c.id",
    );
    return new Map(rows.map((r) => [Number(r.student_id), toComment(r)]));
  }

  // outbound log
  logOutbound(studentToken: string, payload: string) {
    this.write(() => this.run("INSERT INTO outbound_log (student_token, payload) VALUES (?,?)", [studentToken, payload]));
  }
  listOutbound(): OutboundRecord[] {
    return this.all("SELECT * FROM outbound_log ORDER BY id DESC").map((r) => ({
      id: Number(r.id), sentAt: String(r.sent_at), studentToken: String(r.student_token), payload: String(r.payload),
    }));
  }

  // settings
  getSetting(key: string): string | null {
    const r = this.all("SELECT value FROM settings WHERE key = ?", [key])[0];
    return r ? String(r.value) : null;
  }
  setSetting(key: string, value: string) {
    this.write(() => this.run("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]));
  }
  deleteSetting(key: string) {
    this.write(() => this.run("DELETE FROM settings WHERE key = ?", [key]));
  }

  /** Row counts for the privacy page. */
  stats() {
    const n = (t: string) => Number(this.all(`SELECT COUNT(*) AS n FROM ${t}`)[0].n);
    return { classes: n("classes"), students: n("students"), observations: n("observations"), comments: n("comments"), outbound: n("outbound_log") };
  }

  isEmpty() {
    return this.stats().students === 0;
  }

  export(): Uint8Array {
    return this.db.export();
  }

  close() {
    this.db.close();
  }
}

const toStudent = (r: Row): Student => ({
  id: Number(r.id),
  classId: Number(r.class_id),
  firstName: String(r.first_name),
  lastName: String(r.last_name),
  pronouns: r.pronouns as Student["pronouns"],
});

const toComment = (r: Row): Comment => ({
  id: Number(r.id),
  studentId: Number(r.student_id),
  body: String(r.body),
  method: r.method as Comment["method"],
  status: r.status as Comment["status"],
  createdAt: String(r.created_at),
});
