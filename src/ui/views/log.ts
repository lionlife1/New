import { activeMention, handleFor, parseMentions } from "../../core/mentions";
import { TAG_LABEL, type Observation, type Source, type Student, type Tag } from "../../core/types";
import type { Ctx } from "../context";
import { dictationSupported, startDictation } from "../dictation";
import { formatWhen, h } from "../dom";

const TAGS: Tag[] = ["strength", "growth", "habits", "note"];

export function noteItem(ctx: Ctx, o: Observation, roster: Student[], opts: { showStudents?: boolean } = {}) {
  const names = o.studentIds
    .map((id) => roster.find((s) => s.id === id))
    .filter((s): s is Student => Boolean(s));
  return h(
    "li",
    { class: `note note-${o.tag}` },
    h("p", { class: "note-body" }, h("span", { class: "mark" }, o.body)),
    h(
      "p",
      { class: "note-meta" },
      h("span", { class: "note-tag" }, TAG_LABEL[o.tag]),
      opts.showStudents !== false && names.length
        ? h("span", null, ...names.flatMap((s, i) => [i ? ", " : "", h("a", { href: `#/student/${s.id}` }, `${s.firstName} ${s.lastName}`.trim())]))
        : null,
      h("time", { datetime: o.createdAt }, formatWhen(o.createdAt)),
      o.source === "dictated" ? h("span", null, "Dictated") : null,
      h(
        "button",
        {
          class: "link-button quiet",
          type: "button",
          "aria-label": `Delete note: ${o.body.slice(0, 40)}`,
          onclick: () => {
            if (!confirm("Delete this note? This can't be undone.")) return;
            ctx.repo.deleteObservation(o.id);
            ctx.toast("Note deleted");
            ctx.rerender();
          },
        },
        "Delete",
      ),
    ),
  );
}

export function emptyStart(loadSample: () => void) {
  return h(
    "section",
    { class: "empty-start" },
    h("h1", null, "Notes now, comments later."),
    h(
      "p",
      null,
      "Jot down what you notice about students during the term. When report cards are due, Chronicle turns each student's notes into a starting comment. Your notes are stored in this browser and nowhere else.",
    ),
    h(
      "div",
      { class: "actions" },
      h("a", { class: "button primary", href: "#/students" }, "Set up my class"),
      h("button", { class: "button", type: "button", onclick: loadSample }, "Look around with a sample class"),
    ),
  );
}

export function renderLog(ctx: Ctx, loadSample: () => void): HTMLElement {
  const roster = ctx.roster();
  if (!roster.length) return emptyStart(loadSample);

  let tag: Tag = "strength";
  let source: Source = "typed";
  let stopDictation: (() => void) | null = null;

  const input = h("textarea", {
    id: "note-input",
    rows: 3,
    placeholder: "Type @ and a name, then what you saw.  @Maya explained slope to her table",
    "aria-describedby": "note-help",
    autocomplete: "off",
    spellcheck: "true",
  });
  const suggest = h("ul", { class: "suggest", role: "listbox", id: "suggest", hidden: true });
  const error = h("p", { class: "form-error", role: "alert" });
  let options: Student[] = [];
  let active = 0;

  const closeSuggest = () => {
    suggest.hidden = true;
    options = [];
    input.removeAttribute("aria-activedescendant");
  };

  const choose = (s: Student) => {
    const m = activeMention(input.value, input.selectionStart);
    if (!m) return;
    const handle = handleFor(s, roster);
    const after = input.value.slice(input.selectionStart);
    input.value = input.value.slice(0, m.start) + "@" + handle + " " + after.replace(/^\s+/, "");
    const pos = m.start + handle.length + 2;
    input.setSelectionRange(pos, pos);
    closeSuggest();
    input.focus();
  };

  const drawSuggest = () => {
    suggest.replaceChildren(
      ...options.map((s, i) =>
        h(
          "li",
          {
            id: `opt-${s.id}`,
            role: "option",
            "aria-selected": String(i === active),
            onmousedown: (e: Event) => {
              e.preventDefault();
              choose(s);
            },
          },
          h("strong", null, `@${handleFor(s, roster)}`),
          ` ${s.firstName} ${s.lastName}`,
        ),
      ),
    );
    if (options[active]) input.setAttribute("aria-activedescendant", `opt-${options[active].id}`);
  };

  input.addEventListener("input", () => {
    error.textContent = "";
    const m = activeMention(input.value, input.selectionStart);
    if (!m) return closeSuggest();
    const q = m.query.toLowerCase();
    options = roster
      .filter((s) => handleFor(s, roster).toLowerCase().startsWith(q) || s.lastName.toLowerCase().startsWith(q))
      .slice(0, 6);
    active = 0;
    suggest.hidden = options.length === 0;
    drawSuggest();
  });
  input.addEventListener("blur", () => setTimeout(closeSuggest, 100));
  input.addEventListener("keydown", (e) => {
    if (!suggest.hidden && options.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
        return drawSuggest();
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        return choose(options[active]);
      }
      if (e.key === "Escape") return closeSuggest();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  const tagPicker = h(
    "fieldset",
    { class: "tag-picker" },
    h("legend", null, "What kind of note is this?"),
    ...TAGS.map((t) =>
      h(
        "label",
        { class: `tag-option tag-${t}` },
        h("input", {
          type: "radio",
          name: "tag",
          value: t,
          checked: t === tag,
          onchange: () => (tag = t),
        }),
        h("span", null, TAG_LABEL[t]),
      ),
    ),
  );

  const micNote = h("p", { class: "fine", id: "mic-note", hidden: true },
    "Dictation uses your browser's speech service. In Chrome, the audio is processed on Google's servers. Type the note instead if that's a concern for your school.");
  const mic: HTMLButtonElement | null = dictationSupported()
    ? h(
        "button",
        {
          type: "button",
          class: "button",
          "aria-pressed": "false",
          "aria-describedby": "mic-note",
          onclick: () => {
            if (stopDictation) {
              stopDictation();
              return;
            }
            const btn = mic!;
            micNote.hidden = false;
            btn.setAttribute("aria-pressed", "true");
            btn.textContent = "Stop dictating";
            stopDictation = startDictation(
              (t) => {
                source = "dictated";
                input.value = (input.value.trimEnd() + " " + t).trimStart();
              },
              (err) => {
                stopDictation = null;
                btn.setAttribute("aria-pressed", "false");
                btn.textContent = "Dictate";
                if (err) error.textContent = err;
                input.focus();
              },
            );
          },
        },
        "Dictate",
      )
    : null;

  const form = h(
    "form",
    {
      class: "capture",
      onsubmit: (e: Event) => {
        e.preventDefault();
        const raw = input.value.trim();
        if (!raw) return input.focus();
        const parsed = parseMentions(raw, roster);
        if (!parsed.studentIds.length) {
          error.textContent = "Tag at least one student with @ so the note is filed under them.";
          return input.focus();
        }
        stopDictation?.();
        ctx.repo.addObservation({ body: parsed.body, tag, source, studentIds: parsed.studentIds });
        const who = parsed.studentIds.map((id) => roster.find((s) => s.id === id)!.firstName).join(" and ");
        ctx.toast(`Note saved for ${who}`);
        ctx.rerender();
        requestAnimationFrame(() => document.getElementById("note-input")?.focus());
      },
    },
    h("label", { for: "note-input", class: "capture-label" }, "New note"),
    h("div", { class: "capture-field" }, input, suggest),
    h("p", { class: "fine", id: "note-help" }, "Enter saves. Shift+Enter adds a line. Tag several students for group work."),
    tagPicker,
    error,
    h("div", { class: "actions" }, h("button", { class: "button primary", type: "submit" }, "Save note"), mic),
    micNote,
  );

  const recent = ctx.repo.listObservations({ limit: 40 }).filter((o) => o.studentIds.some((id) => roster.some((s) => s.id === id)));

  return h(
    "div",
    { class: "view view-log" },
    form,
    h(
      "section",
      { class: "feed", "aria-labelledby": "recent-h" },
      h("h2", { id: "recent-h" }, "Recent notes"),
      recent.length
        ? h("ul", { class: "notes" }, ...recent.map((o) => noteItem(ctx, o, roster)))
        : h("p", { class: "muted" }, "No notes yet. Your first one will show up here."),
    ),
  );
}
