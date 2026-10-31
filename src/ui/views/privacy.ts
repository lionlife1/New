import { API_KEY_STORAGE, type Ctx } from "../context";
import { formatWhen, h, plural } from "../dom";

export function renderPrivacy(ctx: Ctx, restore: (bytes: Uint8Array) => Promise<void>): HTMLElement {
  const stats = ctx.repo.stats();
  const outbound = ctx.repo.listOutbound();
  const hasKey = Boolean(localStorage.getItem(API_KEY_STORAGE));

  const teacher = h("input", { id: "teacher", value: ctx.repo.getSetting("teacherName") ?? "", autocomplete: "off" });
  const school = h("input", { id: "school", value: ctx.repo.getSetting("schoolName") ?? "", autocomplete: "off" });
  const key = h("input", { id: "key", type: "password", autocomplete: "off", placeholder: hasKey ? "Saved. Paste a new key to replace it." : "sk-ant-..." });
  const file = h("input", { id: "restore", type: "file", accept: ".sqlite,.db,application/x-sqlite3", class: "sr-only" });

  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (!confirm(`Replace everything in Chronicle with ${f.name}?`)) return;
    try {
      await restore(new Uint8Array(await f.arrayBuffer()));
      ctx.toast("Backup restored");
    } catch {
      ctx.toast("That file isn't a Chronicle backup.");
    }
  });

  const download = () => {
    const bytes = ctx.repo.export();
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/x-sqlite3" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `chronicle-${new Date().toISOString().slice(0, 10)}.sqlite` });
    a.click();
    URL.revokeObjectURL(a.href);
    ctx.toast("Backup downloaded");
  };

  return h(
    "div",
    { class: "view view-privacy" },
    h("h1", null, "Privacy and settings"),
    h(
      "section",
      { "aria-labelledby": "where-h" },
      h("h2", { id: "where-h" }, "Where your notes live"),
      h(
        "p",
        null,
        "In a SQLite database inside this browser, on this computer. Chronicle has no server and no account. Clearing your browser data or using a different browser means starting over, so download a backup now and then.",
      ),
      h(
        "dl",
        { class: "stats" },
        ...([
          ["Classes", stats.classes],
          ["Students", stats.students],
          ["Notes", stats.observations],
          ["Comment versions", stats.comments],
        ] as const).flatMap(([k, v]) => [h("dt", null, k), h("dd", null, String(v))]),
      ),
    ),
    h(
      "section",
      { "aria-labelledby": "sent-h" },
      h("h2", { id: "sent-h" }, "What has left this device"),
      outbound.length
        ? h(
            "div",
            null,
            h("p", null, `${plural(outbound.length, "request")} to Claude. Each one is shown exactly as it was sent.`),
            h(
              "ol",
              { class: "outbound" },
              ...outbound.map((o) => h("li", null, h("details", null, h("summary", null, formatWhen(o.sentAt)), h("pre", { class: "payload" }, o.payload)))),
            ),
          )
        : h("p", null, "Nothing. Chronicle only sends data when you choose Draft with Claude and approve the exact text."),
    ),
    h(
      "form",
      {
        class: "settings",
        "aria-labelledby": "scrub-h",
        onsubmit: (e: Event) => {
          e.preventDefault();
          ctx.repo.setSetting("teacherName", teacher.value.trim());
          ctx.repo.setSetting("schoolName", school.value.trim());
          ctx.toast("Saved");
        },
      },
      h("h2", { id: "scrub-h" }, "Names to remove before sending"),
      h("p", null, "Student names come from your roster automatically. Add your own name and your school's so they're removed too."),
      h("label", { for: "teacher" }, "Your name, as students write it"),
      teacher,
      h("label", { for: "school" }, "School name"),
      school,
      h("div", { class: "actions" }, h("button", { class: "button primary", type: "submit" }, "Save names")),
    ),
    h(
      "form",
      {
        class: "settings",
        "aria-labelledby": "key-h",
        onsubmit: (e: Event) => {
          e.preventDefault();
          const k = key.value.trim();
          if (!k) return key.focus();
          localStorage.setItem(API_KEY_STORAGE, k);
          ctx.toast("API key saved in this browser");
          ctx.rerender();
        },
      },
      h("h2", { id: "key-h" }, "Claude API key"),
      h("p", null, "Optional. Without a key, Chronicle still writes starter drafts on this computer. The key stays in this browser's local storage, is sent only to api.anthropic.com, and is not included in backups."),
      h("label", { for: "key" }, "Anthropic API key"),
      key,
      h(
        "div",
        { class: "actions" },
        h("button", { class: "button primary", type: "submit" }, hasKey ? "Replace key" : "Save key"),
        hasKey
          ? h("button", { class: "button", type: "button", onclick: () => { localStorage.removeItem(API_KEY_STORAGE); ctx.toast("API key removed"); ctx.rerender(); } }, "Remove key")
          : null,
      ),
    ),
    h(
      "section",
      { "aria-labelledby": "backup-h" },
      h("h2", { id: "backup-h" }, "Backup"),
      h("p", null, "The backup is the whole database as a single .sqlite file. You can open it with any SQLite tool."),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "button", type: "button", onclick: download }, "Download backup"),
        h("label", { class: "button", for: "restore" }, "Restore from backup"),
        file,
      ),
    ),
    h(
      "section",
      { "aria-labelledby": "erase-h" },
      h("h2", { id: "erase-h" }, "Erase everything"),
      h("p", null, "Deletes every class, student, note and comment from this browser, plus the saved API key."),
      h(
        "button",
        {
          class: "button danger",
          type: "button",
          onclick: async () => {
            if (!confirm("Erase all of Chronicle's data from this browser? Download a backup first if you might want it.")) return;
            await ctx.resetAll();
            ctx.toast("Everything erased");
          },
        },
        "Erase everything",
      ),
    ),
  );
}
