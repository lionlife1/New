import type { Pronouns } from "../../core/types";
import type { Ctx } from "../context";
import { h, plural } from "../dom";
import { tally } from "../tally";

const PRONOUNS: Pronouns[] = ["she", "he", "they"];

/** "Maya Okafor, she" / "Okafor, Maya" / "Maya" -> student fields. */
export function parseRosterLine(line: string): { firstName: string; lastName: string; pronouns: Pronouns } | null {
  let t = line.replace(/\t/g, ",").trim();
  if (!t) return null;
  let pronouns: Pronouns = "they";
  const p = /[,;]\s*(she|he|they)(\/\w+)?\s*$/i.exec(t);
  if (p) {
    pronouns = p[1].toLowerCase() as Pronouns;
    t = t.slice(0, p.index).trim();
  }
  let first: string;
  let last: string;
  if (t.includes(",")) {
    const [a, b] = t.split(",").map((x) => x.trim());
    [first, last] = [b ?? "", a];
  } else {
    const parts = t.split(/\s+/);
    first = parts.shift() ?? "";
    last = parts.join(" ");
  }
  if (!first) return null;
  return { firstName: first, lastName: last, pronouns };
}

export function renderRoster(ctx: Ctx, loadSample: () => void): HTMLElement {
  const classes = ctx.repo.listClasses();
  const current = classes.find((c) => c.id === ctx.classId) ?? null;

  const newClass = h(
    "form",
    {
      class: "inline-form",
      onsubmit: (e: Event) => {
        e.preventDefault();
        const name = (newClassInput.value || "").trim();
        if (!name) return newClassInput.focus();
        const id = ctx.repo.addClass(name);
        ctx.setClass(id);
        ctx.toast(`Added ${name}`);
      },
    },
    h("label", { for: "new-class" }, current ? "Add another class" : "Name your class"),
    h("div", { class: "row" }),
  );
  const newClassInput = h("input", { id: "new-class", placeholder: "Period 3 Biology", autocomplete: "off" });
  newClass.querySelector(".row")!.append(newClassInput, h("button", { class: "button", type: "submit" }, "Add class"));

  if (!current) {
    return h(
      "div",
      { class: "view view-roster" },
      h("h1", null, "Your classes"),
      h("p", { class: "lede" }, "Start with one class. You can paste a roster straight from a spreadsheet next."),
      newClass,
      h("p", { class: "muted" }, "Or ", h("button", { class: "link-button", type: "button", onclick: loadSample }, "load a sample class"), " to see how it works."),
    );
  }

  const students = ctx.repo.listStudents(current.id);
  const counts = ctx.repo.noteCounts(current.id);

  const bulk = h("textarea", {
    id: "bulk",
    rows: 5,
    placeholder: "Maya Okafor, she\nLeo Brandt, he\nSam Reyes, they\nNair, Priya",
  });
  const bulkError = h("p", { class: "form-error", role: "alert" });

  const table = students.length
    ? h(
        "table",
        { class: "ledger" },
        h("caption", { class: "sr-only" }, `Students in ${current.name}`),
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Student"), h("th", { scope: "col" }, "Pronouns"), h("th", { scope: "col" }, "Notes"), h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Actions")))),
        h(
          "tbody",
          null,
          ...students.map((s) =>
            h(
              "tr",
              null,
              h("th", { scope: "row" }, h("a", { href: `#/student/${s.id}` }, `${s.firstName} ${s.lastName}`.trim())),
              h(
                "td",
                null,
                h(
                  "select",
                  {
                    "aria-label": `Pronouns for ${s.firstName}`,
                    onchange: (e: Event) => {
                      ctx.repo.updateStudent({ ...s, pronouns: (e.target as HTMLSelectElement).value as Pronouns });
                      ctx.toast(`Updated ${s.firstName}`);
                    },
                  },
                  ...PRONOUNS.map((p) => h("option", { value: p, selected: p === s.pronouns }, p)),
                ),
              ),
              h("td", { class: "tally-cell" }, tally(counts.get(s.id) ?? 0), h("span", { class: "count" }, String(counts.get(s.id) ?? 0))),
              h(
                "td",
                { class: "row-actions" },
                h(
                  "button",
                  {
                    class: "link-button quiet",
                    type: "button",
                    onclick: () => {
                      const n = counts.get(s.id) ?? 0;
                      if (!confirm(`Remove ${s.firstName} ${s.lastName}? ${n ? `Their ${plural(n, "note")} and comments will be deleted too.` : ""}`)) return;
                      ctx.repo.deleteStudent(s.id);
                      ctx.toast(`Removed ${s.firstName}`);
                      ctx.rerender();
                    },
                  },
                  "Remove",
                ),
              ),
            ),
          ),
        ),
      )
    : h("p", { class: "muted" }, "No students yet. Paste your roster below.");

  return h(
    "div",
    { class: "view view-roster" },
    h(
      "div",
      { class: "title-row" },
      h("h1", null, current.name),
      h(
        "button",
        {
          class: "link-button",
          type: "button",
          onclick: () => {
            const name = prompt("Rename class", current.name)?.trim();
            if (!name) return;
            ctx.repo.renameClass(current.id, name);
            ctx.rerender();
          },
        },
        "Rename",
      ),
    ),
    h("p", { class: "lede" }, students.length ? `${plural(students.length, "student")}. Pronouns are used when Chronicle writes a starter comment.` : "Add your students to start taking notes."),
    table,
    h(
      "form",
      {
        class: "bulk-add",
        onsubmit: (e: Event) => {
          e.preventDefault();
          const lines = bulk.value.split(/\r?\n/);
          const parsed = lines.map(parseRosterLine).filter((x): x is NonNullable<typeof x> => Boolean(x));
          if (!parsed.length) {
            bulkError.textContent = "Enter at least one name, one student per line.";
            return bulk.focus();
          }
          parsed.forEach((p) => ctx.repo.addStudent({ classId: current.id, ...p }));
          ctx.toast(`Added ${plural(parsed.length, "student")}`);
          ctx.rerender();
        },
      },
      h("label", { for: "bulk" }, "Add students"),
      h("p", { class: "fine" }, "One per line. Paste from a spreadsheet works too. Add she, he or they after a comma; otherwise Chronicle uses the name instead of a pronoun."),
      bulk,
      bulkError,
      h("button", { class: "button primary", type: "submit" }, "Add students"),
    ),
    h("hr"),
    newClass,
    h(
      "p",
      null,
      h(
        "button",
        {
          class: "link-button danger",
          type: "button",
          onclick: () => {
            if (!confirm(`Delete ${current.name} and everything in it? This can't be undone.`)) return;
            ctx.repo.deleteClass(current.id);
            ctx.setClass(ctx.repo.listClasses()[0]?.id ?? null);
            ctx.toast(`Deleted ${current.name}`);
          },
        },
        `Delete ${current.name}`,
      ),
    ),
  );
}
