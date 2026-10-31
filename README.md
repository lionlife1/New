# Chronicle

Teachers spend whole weekends writing report card comments, usually from memory. Chronicle is for the weeks before that: you jot down short notes about students as things happen, and when comments are due, each student already has a page of evidence and a draft.

**Live prototype:** https://lionlife1.github.io/New/ (choose "Look around with a sample class")

## The privacy constraint is the design

Schools hesitate to pilot tools that send student information to a vendor. So Chronicle has no vendor server at all:

- **Notes live in the teacher's browser.** The whole dataset is a real SQLite database (compiled to WebAssembly with sql.js), saved to IndexedDB. Backups are a single `.sqlite` file you can open with any SQLite tool.
- **Starter drafts are written locally.** A small rules-based writer rearranges the teacher's own notes into a comment, using the student's pronouns. No network.
- **The AI rewrite is opt-in and de-identified.** Before anything goes to Claude, roster names, the teacher's name, the school name, emails and phone numbers are replaced with tokens like `[STUDENT_1]`. The teacher sees the exact payload, a list of what was replaced, and a leak check, and has to press Send. Names are put back into the reply on the device. Every request is logged on the Privacy page word for word.

One honest exception: the Dictate button uses the browser's speech recognition, and in Chrome that audio goes to Google. The UI says so next to the button. On-device speech (Whisper in the browser) is the obvious next step.

## How it works

```
src/
  core/        pure logic, no DOM: @mentions, de-identification, starter drafts, CSV
  db/          SQLite schema, typed repository, IndexedDB persistence
  ai/          the optional Claude call (browser, user-supplied key)
  ui/          plain DOM views: log, class, student, comments, privacy
  sample.ts    a fictional class for the demo
tests/         Vitest: core logic and the SQL layer (runs sql.js in Node)
e2e/smoke.mjs  Playwright run through the whole flow, including a mocked Claude call
```

Schema highlights (`src/db/schema.ts`): one note can be about several students (`observation_students`), every saved comment version is kept (`comments`), and `outbound_log` stores the exact text of anything that left the device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + SQL tests
npm run build && npm run e2e   # end-to-end in headless Chromium
```

Pushing to `main` runs the tests and deploys `dist/` to GitHub Pages. In the repository settings, set Pages > Source to "GitHub Actions" once.

## Prototype limits

- One teacher, one browser. No sync, no accounts, no SIS integration.
- The API key is stored in `localStorage`. Fine for a demo; a real pilot would put a small proxy with a zero-retention agreement in front of the model instead.
- De-identification catches what Chronicle knows about (roster, teacher, school, emails, phones). A note like "the kid whose mom is the principal" would still be identifying, which is why the teacher reviews every payload.
- The starter writer is deliberately plain. It only rearranges what the teacher wrote and will read a bit mechanical.
