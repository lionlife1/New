import { buildUserMessage, ClaudeError, MODEL, rewriteWithClaude } from "../../ai/claude";
import { deidentify, findLeaks, reidentify } from "../../core/deidentify";
import { draftComment } from "../../core/draft";
import { TAG_LABEL, type Observation, type Student, type Tag } from "../../core/types";
import { API_KEY_STORAGE, type Ctx } from "../context";
import { formatWhen, h, plural, wordCount } from "../dom";
import { tally } from "../tally";
import { noteItem } from "./log";

const METHOD_LABEL = { starter: "Starter draft", claude: "Drafted with Claude", edited: "Edited by you" } as const;

/** Builds the scrubbed request and returns everything the review dialog needs to show. */
export function prepareOutbound(ctx: Ctx, student: Student, notes: Observation[]) {
  const roster = ctx.repo.listStudents();
  const deidCtx = {
    roster,
    targetId: student.id,
    teacherName: ctx.repo.getSetting("teacherName") ?? undefined,
    schoolName: ctx.repo.getSetting("schoolName") ?? undefined,
  };
  // Scrub each note separately, but share one token map so STUDENT_2 means the same person throughout.
  const joined = notes.map((n) => n.body).join("\n\u0000\n");
  const result = deidentify(joined, deidCtx);
  const bodies = result.text.split("\n\u0000\n");
  const message = buildUserMessage(student.pronouns === "they" ? "they/them" : student.pronouns === "she" ? "she/her" : "he/him",
    notes.map((n, i) => ({ tag: TAG_LABEL[n.tag].toLowerCase(), body: bodies[i] })));
  return { message, map: result.map, replaced: result.replaced, leaks: findLeaks(message, roster) };
}

function reviewDialog(ctx: Ctx, student: Student, notes: Observation[], onResult: (text: string) => void) {
  const out = prepareOutbound(ctx, student, notes);
  const dialog = h("dialog", { class: "review", "aria-labelledby": "review-h" });
  const status = h("p", { class: "form-error", role: "alert" });
  const keyInput = h("input", { type: "password", id: "api-key", autocomplete: "off", placeholder: "sk-ant-..." });
  const hasKey = () => Boolean(localStorage.getItem(API_KEY_STORAGE));

  const mapping = Object.entries(out.map);
  const send = h("button", { class: "button primary", type: "button", disabled: out.leaks.length > 0 }, "Send to Claude");

  send.addEventListener("click", async () => {
    if (!hasKey()) {
      const k = keyInput.value.trim();
      if (!k) {
        status.textContent = "Paste an API key first.";
        return keyInput.focus();
      }
      localStorage.setItem(API_KEY_STORAGE, k);
    }
    send.disabled = true;
    send.textContent = "Waiting for Claude...";
    status.textContent = "";
    try {
      ctx.repo.logOutbound("[STUDENT_1]", out.message);
      const text = await rewriteWithClaude(localStorage.getItem(API_KEY_STORAGE)!, out.message);
      onResult(reidentify(text, out.map));
      dialog.close();
    } catch (e) {
      status.textContent = e instanceof ClaudeError ? e.message : `Something went wrong: ${(e as Error).message}`;
      send.disabled = false;
      send.textContent = "Try again";
    }
  });

  dialog.append(
    h("h2", { id: "review-h" }, "Check what leaves this device"),
    h("p", null, `This is the exact text that will be sent to Anthropic's API (${MODEL}). Names were replaced on your computer, and Claude's reply will have them put back here.`),
    h("pre", { class: "payload", tabindex: 0 }, out.message),
    h(
      "div",
      { class: "swap-list" },
      h("h3", null, "Replaced before sending"),
      out.replaced.length
        ? h("ul", null, ...out.replaced.map((r) => h("li", null, h("code", null, r.token), ` ${mapping.find(([t]) => t === r.token)?.[1] ?? describeToken(r.token)}, ${plural(r.count, "time")}`)))
        : h("p", { class: "muted" }, "Nothing needed replacing."),
      out.leaks.length
        ? h("p", { class: "leak" }, `Still contains roster names: ${out.leaks.join(", ")}. Sending is blocked until you edit those notes.`)
        : h("p", { class: "ok" }, "No roster names found in the text."),
    ),
    hasKey()
      ? ""
      : h(
          "div",
          { class: "key-field" },
          h("label", { for: "api-key" }, "Anthropic API key"),
          keyInput,
          h("p", { class: "fine" }, "Kept in this browser's local storage and sent only to api.anthropic.com. It is not included in backups. Remove it any time in Privacy."),
        ),
    status,
    h("div", { class: "actions" }, send, h("button", { class: "button", type: "button", onclick: () => dialog.close() }, "Cancel")),
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

const describeToken = (t: string) =>
  ({ "[TEACHER]": "your name", "[SCHOOL]": "school name", "[EMAIL]": "email address", "[PHONE]": "phone number" })[t] ?? t;

export function renderStudent(ctx: Ctx, id: number): HTMLElement {
  const student = ctx.repo.getStudent(id);
  if (!student) {
    return h("div", { class: "view" }, h("h1", null, "Student not found"), h("p", null, "They may have been removed. ", h("a", { href: "#/students" }, "Back to the class list")));
  }
  const roster = ctx.repo.listStudents();
  const notes = ctx.repo.listObservations({ studentId: id });
  const current = ctx.repo.currentComment(id);
  const history = ctx.repo.commentHistory(id).slice(1);

  const counts = notes.reduce<Record<Tag, number>>((acc, n) => ((acc[n.tag] = (acc[n.tag] ?? 0) + 1), acc), { strength: 0, growth: 0, habits: 0, note: 0 });
  const summary = (["strength", "growth", "habits", "note"] as Tag[])
    .filter((t) => counts[t])
    .map((t) => `${counts[t]} ${TAG_LABEL[t].toLowerCase()}${counts[t] === 1 || t === "habits" ? "" : "s"}`)
    .join(", ");

  // Comment editor
  const editor = h("textarea", { id: "comment", class: "comment-text", rows: 9, value: current?.body ?? "" });
  const words = h("span", { class: "fine" });
  const updateWords = () => (words.textContent = plural(wordCount(editor.value), "word"));
  editor.addEventListener("input", updateWords);
  updateWords();

  const status = current ? h("p", { class: `status status-${current.status}` }, current.status === "final" ? "Final" : "Draft", h("span", { class: "fine" }, ` ${METHOD_LABEL[current.method]}, ${formatWhen(current.createdAt)}`)) : null;
  const usable = notes.filter((n) => n.tag !== "note");

  const setDraft = (body: string, method: "starter" | "claude") => {
    ctx.repo.saveComment({ studentId: id, body, method });
    ctx.toast(method === "claude" ? "Claude's draft saved. Read it before you use it." : "Starter draft written from your notes");
    ctx.rerender();
  };

  const confirmReplace = () => !current || editor.value === current.body ? true : confirm("Replace your unsaved edits with a new draft?");

  const starterBtn = h(
    "button",
    {
      class: "button",
      type: "button",
      disabled: usable.length === 0,
      onclick: () => {
        if (!confirmReplace()) return;
        const body = draftComment(student, notes);
        if (body) setDraft(body, "starter");
      },
    },
    current ? "Rewrite starter draft" : "Write starter draft",
  );
  const claudeBtn = h(
    "button",
    {
      class: "button",
      type: "button",
      disabled: usable.length === 0,
      onclick: () => {
        if (!confirmReplace()) return;
        reviewDialog(ctx, student, notes.filter((n) => n.tag !== "note"), (text) => setDraft(text, "claude"));
      },
    },
    "Draft with Claude",
  );

  const commentPanel = h(
    "section",
    { class: "comment-panel", "aria-labelledby": "comment-h" },
    h("h2", { id: "comment-h" }, "Report comment"),
    usable.length === 0
      ? h("p", { class: "muted" }, `There's nothing to write from yet. Tag a strength, growth area or work habit for ${student.firstName} on the Log page.`)
      : usable.length < 3
        ? h("p", { class: "fine warn" }, `Only ${plural(usable.length, "usable note")}. The comment will be thin; a couple more notes would help.`)
        : null,
    status,
    current || usable.length ? h("label", { for: "comment", class: "sr-only" }, `Comment for ${student.firstName}`) : null,
    current ? editor : null,
    current ? h("div", { class: "editor-foot" }, words) : null,
    h(
      "div",
      { class: "actions" },
      current
        ? h(
            "button",
            {
              class: "button primary",
              type: "button",
              onclick: () => {
                const body = editor.value.trim();
                if (!body) return editor.focus();
                if (body !== current.body) ctx.repo.saveComment({ studentId: id, body, method: "edited", status: current.status });
                ctx.toast("Comment saved");
                ctx.rerender();
              },
            },
            "Save",
          )
        : null,
      current
        ? h(
            "button",
            {
              class: "button",
              type: "button",
              onclick: () => {
                const body = editor.value.trim();
                let cid = current.id;
                if (body !== current.body) cid = ctx.repo.saveComment({ studentId: id, body, method: "edited" });
                const next = current.status === "final" ? "draft" : "final";
                ctx.repo.setCommentStatus(cid, next);
                ctx.toast(next === "final" ? "Marked final" : "Moved back to draft");
                ctx.rerender();
              },
            },
            current.status === "final" ? "Move back to draft" : "Mark final",
          )
        : null,
      starterBtn,
      claudeBtn,
    ),
    h("p", { class: "fine" }, "Starter drafts are put together on this computer from your notes only. Claude drafts send de-identified notes after you review them."),
    history.length
      ? h(
          "details",
          { class: "history" },
          h("summary", null, `Earlier versions (${history.length})`),
          h("ol", null, ...history.map((c) => h("li", null, h("p", { class: "fine" }, `${METHOD_LABEL[c.method]}, ${formatWhen(c.createdAt)}`), h("p", { class: "comment-old" }, c.body)))),
        )
      : null,
  );

  return h(
    "div",
    { class: "view view-student" },
    h(
      "header",
      { class: "student-head" },
      h("h1", null, `${student.firstName} ${student.lastName}`.trim()),
      h("p", { class: "student-meta" }, tally(notes.length), h("span", null, notes.length ? `${plural(notes.length, "note")}: ${summary}` : "No notes yet"), h("span", { class: "pronoun" }, student.pronouns)),
    ),
    h(
      "div",
      { class: "student-grid" },
      h(
        "section",
        { "aria-labelledby": "notes-h" },
        h("h2", { id: "notes-h" }, "Notes"),
        notes.length
          ? h("ul", { class: "notes" }, ...notes.map((o) => noteItem(ctx, o, roster, { showStudents: o.studentIds.length > 1 })))
          : h("p", { class: "muted" }, "Nothing yet. On the Log page, type ", h("code", null, "@" + student.firstName), " and what you noticed."),
      ),
      commentPanel,
    ),
  );
}
