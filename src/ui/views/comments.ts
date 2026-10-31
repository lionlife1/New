import { toCsv } from "../../core/csv";
import { draftComment } from "../../core/draft";
import type { Ctx } from "../context";
import { h, plural } from "../dom";
import { tally } from "../tally";

export function renderComments(ctx: Ctx): HTMLElement {
  const roster = ctx.roster();
  const className = ctx.repo.listClasses().find((c) => c.id === ctx.classId)?.name ?? "";
  if (!roster.length) {
    return h("div", { class: "view" }, h("h1", null, "Comments"), h("p", null, "Add students first. ", h("a", { href: "#/students" }, "Set up your class")));
  }
  const counts = ctx.repo.noteCounts(ctx.classId ?? undefined);
  const comments = ctx.repo.currentComments();
  const finals = roster.filter((s) => comments.get(s.id)?.status === "final").length;
  const missing = roster.filter((s) => !comments.has(s.id));
  const draftable = missing.filter((s) => ctx.repo.listObservations({ studentId: s.id }).some((o) => o.tag !== "note"));

  const exportCsv = () => {
    const rows = [["First name", "Last name", "Status", "Comment"]];
    for (const s of roster) {
      const c = comments.get(s.id);
      rows.push([s.firstName, s.lastName, c ? c.status : "none", c?.body ?? ""]);
    }
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `${className || "comments"}.csv`.replace(/[^\w.-]+/g, "-") });
    a.click();
    URL.revokeObjectURL(a.href);
    ctx.toast("CSV downloaded");
  };

  return h(
    "div",
    { class: "view view-comments" },
    h("h1", null, "Report comments"),
    h(
      "p",
      { class: "lede" },
      `${finals} of ${roster.length} final.`,
      missing.length ? ` ${plural(missing.length, "student")} without a comment yet.` : " Every student has a comment.",
    ),
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          class: "button primary",
          type: "button",
          disabled: draftable.length === 0,
          onclick: () => {
            for (const s of draftable) {
              const body = draftComment(s, ctx.repo.listObservations({ studentId: s.id }));
              if (body) ctx.repo.saveComment({ studentId: s.id, body, method: "starter" });
            }
            ctx.toast(`Wrote ${plural(draftable.length, "starter draft")}`);
            ctx.rerender();
          },
        },
        draftable.length ? `Write ${plural(draftable.length, "starter draft")}` : "No drafts to write",
      ),
      h("button", { class: "button", type: "button", onclick: exportCsv }, "Download CSV"),
    ),
    h("p", { class: "fine" }, "The CSV has one row per student, ready to paste into your grading system."),
    h(
      "table",
      { class: "ledger comments-table" },
      h("caption", { class: "sr-only" }, "Comment status by student"),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Student"), h("th", { scope: "col" }, "Notes"), h("th", { scope: "col" }, "Status"), h("th", { scope: "col" }, "Comment"))),
      h(
        "tbody",
        null,
        ...roster.map((s) => {
          const c = comments.get(s.id);
          const n = counts.get(s.id) ?? 0;
          return h(
            "tr",
            { class: n < 3 ? "thin" : "" },
            h("th", { scope: "row" }, h("a", { href: `#/student/${s.id}` }, `${s.firstName} ${s.lastName}`.trim())),
            h("td", { class: "tally-cell" }, tally(n), h("span", { class: "count" }, String(n))),
            h("td", null, h("span", { class: `pill pill-${c?.status ?? "none"}` }, c ? (c.status === "final" ? "Final" : "Draft") : n < 3 ? "Needs notes" : "Not started")),
            h("td", null, c ? h("div", { class: "excerpt" }, c.body) : ""),
          );
        }),
      ),
    ),
  );
}
