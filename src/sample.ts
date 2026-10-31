import type { Repo } from "./db/repo";
import type { Pronouns, Tag } from "./core/types";

// Fictional class for the demo. Note counts are uneven on purpose:
// a few students have almost nothing, which is the real problem at report time.
const STUDENTS: [string, string, Pronouns][] = [
  ["Maya", "Okafor", "she"],
  ["Leo", "Brandt", "he"],
  ["Sam", "Reyes", "they"],
  ["Priya", "Nair", "she"],
  ["Jonah", "Whitfield", "he"],
  ["Ava", "Lindqvist", "she"],
  ["Mateo", "Salas", "he"],
  ["Grace", "Oyelaran", "she"],
  ["Theo", "Marchetti", "he"],
  ["Nadia", "Haddad", "she"],
];

// [days ago, tag, text with @handles]
const NOTES: [number, Tag, string][] = [
  [41, "strength", "@Maya explained slope as \"how steep the stairs are\" and three kids at her table got it"],
  [39, "growth", "@Leo rushes multi-step word problems and drops the units at the end"],
  [38, "habits", "@Priya has turned in every warm-up, even on the two days she was out"],
  [36, "strength", "@Sam asked why a negative times a negative is positive and wouldn't accept \"it's a rule\""],
  [34, "note", "@Jonah moved seats to the front, seems more focused"],
  [33, "strength", "@Leo and @Mateo built the best number-line model in the class for integer subtraction"],
  [31, "growth", "@Maya goes quiet in whole-class discussion even when she clearly has the answer"],
  [29, "strength", "@Priya caught a sign error in my worked example on the board"],
  [27, "habits", "@Sam keeps a notebook that is honestly better organized than my answer key"],
  [26, "growth", "@Jonah is missing 4 of the last 6 homework assignments"],
  [24, "strength", "@Ava wrote a clear explanation of distributing a negative for the exit ticket"],
  [22, "strength", "@Maya volunteered to present her solution to the systems problem"],
  [20, "growth", "@Sam gets stuck on starting a problem and waits instead of trying a first step"],
  [18, "strength", "@Leo checked his own answer by substituting back in without being asked"],
  [17, "habits", "@Mateo comes in at lunch on Tuesdays to redo quiz problems"],
  [15, "growth", "@Priya erases work she thinks is wrong instead of crossing it out, so I can't see her thinking"],
  [13, "strength", "@Jonah solved the challenge problem on the unit test, first one all year"],
  [11, "strength", "@Sam taught the table the \"undo in reverse order\" idea for two-step equations"],
  [9, "growth", "@Ava is confident with procedures but struggles to explain why they work out loud"],
  [7, "strength", "@Priya helped @Grace catch up on the slope notes after she was absent"],
  [6, "habits", "@Leo now writes units on every answer, big change from September"],
  [4, "strength", "@Maya asked a question in front of the whole class about why parallel lines have equal slopes"],
  [2, "note", "@Theo absent most of this week"],
];

export function loadSample(repo: Repo, now = Date.now()): number {
  const classId = repo.addClass("Period 2 Algebra I");
  for (const [first, last, pronouns] of STUDENTS) {
    repo.addStudent({ classId, firstName: first, lastName: last, pronouns });
  }
  const roster = repo.listStudents(classId);
  const byFirst = new Map(roster.map((s) => [s.firstName.toLowerCase(), s.id]));

  for (const [daysAgo, tag, text] of NOTES) {
    const ids: number[] = [];
    const body = text.replace(/@(\w+)/g, (_, h: string) => {
      const id = byFirst.get(h.toLowerCase());
      if (id && !ids.includes(id)) ids.push(id);
      return h;
    });
    // Spread notes across the school day (8am-3pm) so the timestamps look real.
    const d = new Date(now - daysAgo * 86_400_000);
    d.setHours(8 + ((daysAgo * 7) % 8), (daysAgo * 13) % 60, 0, 0);
    repo.addObservation({ body, tag, source: daysAgo % 3 === 0 ? "dictated" : "typed", studentIds: ids, createdAt: d.toISOString() });
  }
  if (!repo.getSetting("teacherName")) repo.setSetting("teacherName", "Ms. Alvarez");
  if (!repo.getSetting("schoolName")) repo.setSetting("schoolName", "Cedar Ridge Middle School");
  return classId;
}
