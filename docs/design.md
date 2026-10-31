# Chronicle prototype: design notes (2026-10-31)

## Goal
Prove that a report-comment tool can be useful to teachers without student data leaving their device, because privacy review is what blocks school pilots.

## Decisions
| Question | Decision | Why |
|---|---|---|
| Hosting | Static GitHub Pages | No server means no student data on a server. The constraint is the pitch. |
| Storage | SQLite via sql.js, persisted to IndexedDB | Real relational schema for the demo; one-file backups. |
| Drafting | Local starter writer by default; optional Claude rewrite | Works for every visitor with no key; AI path demonstrates the de-identification story. |
| AI privacy | Tokenize names locally, show exact payload, leak check blocks sending, log every request | Makes the compliance story inspectable rather than promised. |
| Voice | Browser speech API with an explicit warning | Cheap to ship; honest about the Chrome-to-Google caveat. On-device Whisper is v2. |
| UI stack | Vite + TypeScript, plain DOM | Small surface, no framework needed for five views. |

## Visual direction
A teacher's marking kit as the colour system: highlighter yellow for strengths, blue pencil wavy underline for growth areas, ditto purple for work habits, chalkboard green ink, manila folder tabs for students. Note counts are drawn as tally marks so under-observed students stand out. Atkinson Hyperlegible for the interface, Literata only for comment prose.

## Out of scope
Accounts, multi-device sync, SIS integration, multiple teachers, on-device speech.
