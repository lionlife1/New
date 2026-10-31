import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "./styles.css";

import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { Repo } from "./db/repo";
import { clearFile, debounced, loadFile, saveFile } from "./db/store";
import { loadSample } from "./sample";
import { API_KEY_STORAGE, type Ctx } from "./ui/context";
import { h } from "./ui/dom";
import { tally } from "./ui/tally";
import { renderComments } from "./ui/views/comments";
import { renderLog } from "./ui/views/log";
import { renderPrivacy } from "./ui/views/privacy";
import { renderRoster } from "./ui/views/roster";
import { renderStudent } from "./ui/views/student";

const CLASS_KEY = "chronicle.classId";
const SORT_KEY = "chronicle.railSort";

let SQL: SqlJsStatic;
let repo: Repo;
const saveStatus = h("span", { class: "save-status", role: "status" }, "Saved in this browser");

const persist = debounced(async () => {
  try {
    await saveFile(repo.export());
    saveStatus.textContent = "Saved in this browser";
    saveStatus.classList.remove("error");
  } catch {
    saveStatus.textContent = "Couldn't save. Download a backup from Privacy.";
    saveStatus.classList.add("error");
  }
});

function openRepo(bytes?: Uint8Array | null) {
  repo?.close();
  repo = Repo.open(SQL, bytes, () => {
    saveStatus.textContent = "Saving...";
    persist();
  });
}

const toastRegion = h("div", { class: "toast", role: "status", "aria-live": "polite" });
let toastTimer: ReturnType<typeof setTimeout>;

const ctx: Ctx = {
  get repo() {
    return repo;
  },
  classId: null,
  setClass(id) {
    ctx.classId = id;
    if (id == null) localStorage.removeItem(CLASS_KEY);
    else localStorage.setItem(CLASS_KEY, String(id));
    render();
  },
  rerender: () => render(),
  toast(message) {
    toastRegion.textContent = message;
    toastRegion.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastRegion.classList.remove("show"), 2600);
  },
  roster: () => (ctx.classId == null ? [] : repo.listStudents(ctx.classId)),
  flush: () => persist.flush(),
  async resetAll() {
    await clearFile();
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(CLASS_KEY);
    openRepo(null);
    ctx.classId = null;
    location.hash = "#/log";
    render();
  },
};

function useSample() {
  const id = loadSample(repo);
  ctx.toast("Loaded a sample class. Everything here is made up.");
  location.hash = "#/log";
  ctx.setClass(id);
}

async function restore(bytes: Uint8Array) {
  const test = new SQL.Database(bytes);
  try {
    test.exec("SELECT COUNT(*) FROM students");
  } finally {
    test.close();
  }
  openRepo(bytes);
  persist.flush();
  ctx.classId = repo.listClasses()[0]?.id ?? null;
  render();
}

type Route = { name: "log" | "students" | "comments" | "privacy" } | { name: "student"; id: number };

function route(): Route {
  const [, name, id] = location.hash.split("/");
  if (name === "student" && id) return { name: "student", id: Number(id) };
  if (name === "students" || name === "comments" || name === "privacy") return { name };
  return { name: "log" };
}

function rail(r: Route): HTMLElement | null {
  const roster = ctx.roster();
  if (!roster.length || (r.name !== "log" && r.name !== "student")) return null;
  const counts = repo.noteCounts(ctx.classId ?? undefined);
  const byFewest = localStorage.getItem(SORT_KEY) === "fewest";
  const sorted = byFewest ? [...roster].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)) : roster;
  const currentId = r.name === "student" ? r.id : null;

  return h(
    "aside",
    { class: "rail", "aria-label": "Students" },
    h(
      "div",
      { class: "rail-head" },
      h("h2", null, "Students"),
      h(
        "button",
        {
          class: "link-button",
          type: "button",
          "aria-pressed": String(byFewest),
          onclick: () => {
            localStorage.setItem(SORT_KEY, byFewest ? "name" : "fewest");
            render();
          },
        },
        byFewest ? "Sort by name" : "Fewest notes first",
      ),
    ),
    h(
      "ul",
      { class: "tabs" },
      ...sorted.map((s) => {
        const n = counts.get(s.id) ?? 0;
        return h(
          "li",
          null,
          h(
            "a",
            {
              href: `#/student/${s.id}`,
              class: `tab${n < 3 ? " thin" : ""}`,
              "aria-current": s.id === currentId ? "page" : null,
            },
            h("span", { class: "tab-name" }, s.firstName, " ", h("span", { class: "tab-last" }, s.lastName)),
            tally(n, { max: 15 }),
          ),
        );
      }),
    ),
    h("p", { class: "fine rail-foot" }, "Each mark is one note. Students with fewer than three are shaded."),
  );
}

function header(r: Route): HTMLElement {
  const classes = repo.listClasses();
  const link = (hash: string, label: string, active: boolean) =>
    h("a", { href: hash, "aria-current": active ? "page" : null }, label);
  return h(
    "header",
    { class: "top" },
    h("a", { class: "wordmark", href: "#/log" }, "Chronicle"),
    classes.length > 1
      ? h(
          "select",
          {
            class: "class-picker",
            "aria-label": "Class",
            onchange: (e: Event) => ctx.setClass(Number((e.target as HTMLSelectElement).value)),
          },
          ...classes.map((c) => h("option", { value: c.id, selected: c.id === ctx.classId }, c.name)),
        )
      : classes.length === 1
        ? h("span", { class: "class-name" }, classes[0].name)
        : null,
    h(
      "nav",
      { "aria-label": "Main" },
      link("#/log", "Log", r.name === "log"),
      link("#/students", "Class", r.name === "students"),
      link("#/comments", "Comments", r.name === "comments" || r.name === "student"),
      link("#/privacy", "Privacy", r.name === "privacy"),
    ),
    saveStatus,
  );
}

const root = document.getElementById("app")!;

function render() {
  const r = route();
  const classes = repo.listClasses();
  if (ctx.classId != null && !classes.some((c) => c.id === ctx.classId)) ctx.classId = null;
  if (ctx.classId == null && classes.length) ctx.classId = classes[0].id;
  if (r.name === "student") {
    const s = repo.getStudent(r.id);
    if (s && s.classId !== ctx.classId) ctx.classId = s.classId;
  }

  let view: HTMLElement;
  switch (r.name) {
    case "students":
      view = renderRoster(ctx, useSample);
      break;
    case "student":
      view = renderStudent(ctx, r.id);
      break;
    case "comments":
      view = renderComments(ctx);
      break;
    case "privacy":
      view = renderPrivacy(ctx, restore);
      break;
    default:
      view = renderLog(ctx, useSample);
  }

  const side = rail(r);
  const scrollY = window.scrollY;
  root.replaceChildren(
    h("a", { class: "skip", href: "#main" }, "Skip to content"),
    header(r),
    h("div", { class: `layout${side ? " with-rail" : ""}` }, side, h("main", { id: "main", tabindex: -1 }, view)),
    toastRegion,
  );
  window.scrollTo(0, scrollY);
}

let lastRoute = "";
window.addEventListener("hashchange", () => {
  render();
  if (location.hash !== lastRoute) window.scrollTo(0, 0);
  lastRoute = location.hash;
});
window.addEventListener("pagehide", () => persist.flush());

async function boot() {
  try {
    SQL = await initSqlJs({ locateFile: () => wasmUrl });
    openRepo(await loadFile());
  } catch (e) {
    root.replaceChildren(
      h("div", { class: "view boot-error" }, h("h1", null, "Chronicle couldn't start"), h("p", null, "This browser blocked local storage or WebAssembly. Private browsing modes sometimes do this. Try a regular window."), h("pre", null, String(e))),
    );
    return;
  }
  const saved = Number(localStorage.getItem(CLASS_KEY));
  ctx.classId = saved || null;
  render();
}

boot();
