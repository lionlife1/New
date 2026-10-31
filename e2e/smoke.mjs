// End-to-end smoke test against the production build.
// Usage: npm run build && npm run e2e   (starts `vite preview` itself)
import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Use a local playwright if installed, otherwise the machine's global one.
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(require.resolve("playwright", { paths: [execSync("npm root -g").toString().trim()] }));
}
const { chromium } = playwright;

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe", detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes(String(PORT)) && resolve());
  server.on("exit", reject);
  setTimeout(() => reject(new Error("preview server did not start")), 15000);
});

const check = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok -", msg);
};

const browser = await chromium.launch();
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  // Record every request that leaves the page for something other than our own origin.
  const external = [];
  let claudeBody = null;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    external.push(url);
    if (url.startsWith("https://api.anthropic.com/")) {
      claudeBody = JSON.parse(route.request().postData());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
          stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
          content: [{ type: "text", text: "[STUDENT_1] explains ideas clearly and helps classmates. [STUDENT_1] should keep speaking up in discussion." }],
        }),
      });
    }
    return route.abort();
  });

  await page.goto(BASE);
  await page.getByRole("heading", { name: "Notes now, comments later." }).waitFor();
  await page.screenshot({ path: SHOTS + "01-empty.png" });

  await page.getByRole("button", { name: "Look around with a sample class" }).click();
  await page.getByRole("heading", { name: "Recent notes" }).waitFor();
  check((await page.locator(".tabs .tab").count()) === 10, "sample roster shows 10 student tabs");
  await page.screenshot({ path: SHOTS + "02-log.png", fullPage: true });

  // Autocomplete a mention and save a note.
  const input = page.locator("#note-input");
  await input.click();
  await input.pressSequentially("@Gra");
  await page.locator(".suggest li").first().waitFor();
  await page.screenshot({ path: SHOTS + "03-suggest.png" });
  await input.press("Enter");
  check((await input.inputValue()) === "@Grace ", "Enter picks the suggestion");
  await input.pressSequentially("asked to retake the quiz and raised her score by two letter grades");
  await page.getByText("Strength", { exact: true }).first().click();
  await input.press("Enter");
  await page.getByText("Note saved for Grace").waitFor();
  check(await page.locator(".notes li").first().getByText("raised her score").isVisible(), "new note appears at the top of the feed");

  // Missing mention is rejected.
  await input.fill("no student here");
  await input.press("Enter");
  check(await page.getByRole("alert").getByText("Tag at least one student").isVisible(), "note without @mention shows an error");

  // Student page: starter draft, edit, mark final.
  await page.locator(".tabs a", { hasText: "Maya" }).click();
  await page.getByRole("heading", { name: "Maya Okafor" }).waitFor();
  await page.getByRole("button", { name: "Write starter draft" }).click();
  const comment = page.locator("#comment");
  await comment.waitFor();
  const draft = await comment.inputValue();
  check(draft.startsWith("Maya ") && draft.includes("One thing to work on next"), "starter draft is built from Maya's notes");
  await page.screenshot({ path: SHOTS + "04-student.png", fullPage: true });

  // Claude rewrite: review dialog shows scrubbed payload, then the mocked reply is re-identified.
  await page.getByRole("button", { name: "Draft with Claude" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const payload = await dialog.locator(".payload").innerText();
  check(!/Maya|Okafor|Leo|Alvarez|Cedar Ridge/.test(payload), "payload has no student, teacher or school names");
  check(payload.includes("[STUDENT_1]"), "payload uses placeholders");
  await page.screenshot({ path: SHOTS + "05-review.png" });
  await dialog.locator("#api-key").fill("sk-ant-test-not-real");
  await dialog.getByRole("button", { name: "Send to Claude" }).click();
  await page.getByText("Claude's draft saved").waitFor();
  check((await comment.inputValue()).startsWith("Maya explains ideas clearly"), "Claude reply has the name put back locally");
  check(claudeBody && claudeBody.model === "claude-opus-5-5", "request uses the expected model");
  check(!/Maya|Okafor/.test(JSON.stringify(claudeBody)), "actual network request body contains no student name");

  await page.getByRole("button", { name: "Mark final" }).click();
  await page.getByText("Marked final").waitFor();

  // Comments overview + bulk drafts.
  await page.getByRole("link", { name: "Comments" }).click();
  await page.getByRole("heading", { name: "Report comments" }).waitFor();
  check(await page.getByText("1 of 10 final.").isVisible(), "comments page counts finals");
  await page.getByRole("button", { name: /Write \d+ starter drafts?/ }).click();
  await page.getByText(/Wrote \d+ starter draft/).waitFor();
  await page.screenshot({ path: SHOTS + "06-comments.png", fullPage: true });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  check(download.suggestedFilename().endsWith(".csv"), "CSV downloads");

  // Privacy page shows what left the device.
  await page.getByRole("link", { name: "Privacy" }).click();
  await page.getByRole("heading", { name: "What has left this device" }).waitFor();
  check(await page.getByText("1 request to Claude").isVisible(), "privacy page lists the one outbound request");
  await page.screenshot({ path: SHOTS + "07-privacy.png", fullPage: true });

  // Persistence across reload (IndexedDB).
  await page.waitForTimeout(500);
  await page.goto(BASE + "#/log");
  await page.reload();
  await page.locator(".tabs a", { hasText: "Grace" }).click();
  check(await page.getByText("raised her score").isVisible(), "notes survive a reload");

  // Mobile layout renders.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "#/log");
  await page.getByRole("heading", { name: "Recent notes" }).waitFor();
  await page.screenshot({ path: SHOTS + "08-mobile.png" });

  check(errors.length === 0, `no page errors (${errors.join("; ")})`);
  const unexpected = external.filter((u) => !u.startsWith("https://api.anthropic.com/"));
  check(unexpected.length === 0, `no other third-party requests (${unexpected.join(", ")})`);
} catch (e) {
  failed = true;
  console.error(e.message);
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {}
}
process.exit(failed ? 1 : 0);
