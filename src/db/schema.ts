export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS classes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL DEFAULT '',
  pronouns    TEXT NOT NULL DEFAULT 'they' CHECK (pronouns IN ('she','he','they'))
);

CREATE TABLE IF NOT EXISTS observations (
  id          INTEGER PRIMARY KEY,
  body        TEXT NOT NULL,
  tag         TEXT NOT NULL CHECK (tag IN ('strength','growth','habits','note')),
  source      TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','dictated')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One note can be about several students (group work, pairs).
CREATE TABLE IF NOT EXISTS observation_students (
  observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (observation_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_obs_students_student ON observation_students(student_id);

-- Every saved version of a comment; the newest row per student is current.
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  method      TEXT NOT NULL CHECK (method IN ('starter','claude','edited')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_student ON comments(student_id, id);

-- Exact text of everything that has ever left this device.
CREATE TABLE IF NOT EXISTS outbound_log (
  id            INTEGER PRIMARY KEY,
  sent_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  student_token TEXT NOT NULL,
  payload       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
