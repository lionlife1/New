# Chronicle: security architecture options

Status: **proposal, awaiting decision**
Date: 2026-11-01
Context: the current prototype (see `docs/design.md`) keeps all data in one browser. For the pitch-off (2 to 4 weeks out, live demo), Chronicle should be built the way a real product would be, so the security story is real and later work is not thrown away.

Demo data stays fictional. Building it "for real" does not make it legal to load real student records: that needs a company, a signed district data agreement and an audit trail.

---

## 1. What "works best" means here

Each option is scored against the people who have to say yes.

| # | Criterion | Who cares | Why |
|---|---|---|---|
| C1 | **Breach impact**: what an attacker gets from our servers or a stolen staff login | District, judges, parents | PowerSchool (Dec 2024) was breached through a contractor's support-portal login and an export tool. Encryption at rest did nothing. |
| C2 | **District ownership and recovery**: can the school get records back if a teacher leaves or loses access? | District | Data agreements (NDPA) make the district the owner, responsible for parent review/deletion requests and data return. |
| C3 | **Teacher friction**: extra steps beyond "sign in" | Teacher | Teachers will not tolerate a second password or lost work. |
| C4 | **Multi-device**: note on phone in class, write comments on laptop | Teacher | Core to the workflow. |
| C5 | **Server-side features** possible later (search across devices, admin dashboards, analytics) | Company | Limits what we can build. |
| C6 | **Fit with how schools buy** (NDPA, Texas Ed. Code ch. 32, retention rules) | District | Blackbaud's FTC order (2024) was the first case over keeping data too long. |
| C7 | **Build effort** for one developer in 2 to 4 weeks | You | The pitch date is fixed. |
| C8 | **Live demo risk** | You | Wifi, browsers, and venue laptops fail. |

---

## 2. How established products do it

| Product | Approach | What makes it acceptable | What went wrong |
|---|---|---|---|
| Canva for Education | Standard cloud on AWS. AES-256 at rest, TLS in transit, US/EU residency. | ISO 27001, SOC 2 Type 2, iKeepSafe FERPA/COPPA certification, signed NDPA in many states, school-controlled export/delete, no AI training on student work. | Nothing public. Note that districts approve only the Education tier, so the contract is part of the product. |
| Blackbaud | Standard cloud, provider can read data. | Same kind of paperwork. | 2020 ransomware: attacker inside for 3 months, took unencrypted data, data kept for years past need. $49.5M to 49 states + DC; FTC order requiring deletion and a retention schedule. |
| PowerSchool | Standard cloud, provider can read data. | Same kind of paperwork. | Dec 2024: stolen contractor credentials → support portal → export tool → student/staff records across many districts. Ransom reportedly paid. |
| Bitwarden (Enterprise) | End-to-end encrypted. Each member's key is also wrapped to the organization's public key. | Admins can reset a member's access without being able to read every vault in normal operation. | n/a. Included as the design reference for option D. |
| Proton | End-to-end encrypted, user-held recovery phrase or file. | Servers never hold readable data. | No organization-level escrow, so it doesn't fit district ownership. |

**Lesson:** incumbents earn trust through **process** (audits, agreements, deletion controls), not architecture. Their breaches came from **legitimate access paths** that could read everything. A product that combines incumbent-style process with an architecture where server-side access yields nothing readable has a real difference to point to.

---

## 3. Data architecture options

### A. Local-only, hardened
Today's app plus a passcode lock, encryption at rest in the browser, and a server-side proxy for the AI key.
- Breach: nothing on our servers except scrubbed AI requests in transit.
- Fails C2 and C4: data dies with the browser; no phone-to-laptop.

### B. Standard cloud (the Canva/Blackbaud/PowerSchool model)
Postgres with row-level security per teacher, provider encryption at rest, school admin role.
- Easiest to build, and every server-side feature is possible.
- Breach: a server compromise or stolen support login reads everything (the PowerSchool path). The privacy pitch reduces to "we follow the rules."

### C. End-to-end, teacher-held key
Random notebook key created on the teacher's device, kept there as a non-extractable key. Server stores only ciphertext. A one-time recovery code unlocks new devices.
- Strongest privacy.
- Fails C2: a teacher who leaves, or who loses all devices and the code, takes the district's records with them.

### D. End-to-end, teacher key + school recovery key (Bitwarden model) ← recommended
Like C, but each teacher's notebook key is **also** wrapped to a school recovery public key. The matching private key is generated in the browser by a school admin and kept by the school (downloaded file, ideally printed and stored offline). We never hold it.
- Breach: server or support access yields ciphertext and wrapped keys only.
- District can restore a teacher's access or export records for a parent request without us.
- Teacher friction: sign in with an email code. The personal recovery code becomes optional, because the school can recover.
- Cost: a "school" entity, an admin role, an enrollment step, and a recovery page.

### E. Pseudonymized cloud
Server stores notes with names replaced by student IDs. The ID-to-name roster stays on the device or with the school.
- Server-side features are easy, and it echoes Texas's masking-by-identifier idea.
- Free text still identifies kids ("whose mom coaches volleyball"), so the server holds sensitive data in practice.

### F. Passkey-derived keys (WebAuthn PRF)
The encryption key is derived from the teacher's passkey, so there is no recovery code.
- Best UX on paper.
- 2026 support depends on browser + OS + authenticator. Safari has a known bug returning wrong PRF output for security keys, and Bitwarden and Dashlane passkeys don't support it in desktop Chrome. Too risky for a live demo. Could be added on top of D later as an unlock method.

### Scoring (✔ good, ~ partial, ✘ poor)

| | C1 Breach | C2 District | C3 Friction | C4 Devices | C5 Server features | C6 School fit | C7 Effort | C8 Demo risk |
|---|---|---|---|---|---|---|---|---|
| A Local hardened | ✔ | ✘ | ✔ | ✘ | ✘ | ~ | ✔ low | ✔ |
| B Standard cloud | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ low | ✔ |
| C Teacher key | ✔ | ✘ | ~ | ✔ | ✘ | ✘ | ~ med | ~ |
| **D Teacher + school key** | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ med-high | ~ |
| E Pseudonymized | ~ | ✔ | ✔ | ✔ | ✔ | ~ | ~ med | ✔ |
| F Passkey PRF | ✔ | ✘ alone | ✔ | ~ | ✘ | ~ | ~ med | ✘ |

**D is the only option without a ✘.** B is the safe fallback if time runs short, and moving from B to D later means re-encrypting everything, so pick once.

C5 for D, spelled out: anything that needs to read notes (AI drafting, search) runs on the device. The server can still do counts, sync, admin settings and retention, which is enough for the product as designed.

---

## 4. Supporting choices

### 4.1 Backend platform

| | Supabase | Vercel + add-ons | Cloudflare (Workers + D1) | Firebase |
|---|---|---|---|---|
| Auth with email codes | Built in, with rate limiting | Hand-rolled or a paid auth add-on | Hand-rolled | Built in (email link by default; codes need extra work) |
| Database + per-user access rules | Postgres + row-level security | Postgres via marketplace | SQLite (D1), rules in code | Firestore rules |
| Server function for the Claude key | Edge Functions | Serverless functions | Workers | Cloud Functions |
| Reachable from this coding session | ✘ blocked by network policy (fixable in settings) | ✔ via connector | ✘ not connected | ✘ not connected |
| Frontend | Stays on GitHub Pages | Moves to Vercel | Pages or Cloudflare Pages | Firebase Hosting |

**Recommendation: Supabase.** Login code is where small teams make security mistakes, and Supabase's is built and rate-limited. Under option D the database only stores ciphertext and wrapped keys, so its job is small. The network block is a settings change; if you don't want to make it, I write everything and you run three commands.

### 4.2 Sign-in

| Method | Fit | Notes |
|---|---|---|
| Email + 6-digit code | ✔ Any school | Codes avoid the problem of email scanners auto-clicking magic links. Supabase's built-in email sends only a few messages an hour, so connect a sending service (e.g. Resend) before the pitch. |
| Microsoft (Entra ID) | ✔ Your school uses Microsoft | Needs an Azure app registration. A student account may not be allowed to register apps in the school tenant; a personal Azure account works. |
| Google | ~ Common in US districts | Needs a Google Cloud OAuth client. |
| Passkeys | Later | See option F. |

Recommendation: email code first, then Microsoft as the second button, since that is what your school and likely your pitch audience use. Confirm.

### 4.3 AI drafting
| Option | Verdict |
|---|---|
| Teacher pastes own API key (current) | ✘ Not real-product behaviour. |
| **Server proxy holding our key** | ✔ Checks sign-in, caps requests per teacher per day, never logs request bodies. Receives only de-identified text, scrubbed on device as today. |
| Model running in the browser | ✘ Large download, weaker comments, risky on stage. |

### 4.4 Process features to copy from the incumbents (cheap, high credibility)
- **Retention**: notebooks auto-delete a set time after the school year ends, with warnings first. (Blackbaud lesson.)
- **School export and delete**: admin can export a teacher's records (via the recovery key) or delete them.
- **Privacy page written to match NDPA headings**: what is collected, where it lives, who can read it, retention, breach notification.
- **Roadmap slide, not claims**: SOC 2, signed NDPA and iKeepSafe come after there is a company. Don't claim them.

---

## 5. Recommendation

**Option D on Supabase, email-code sign-in with Microsoft second, server-side AI proxy, plus retention and export features.**

Pitch line: *"Canva-level paperwork, but built so a PowerSchool-style breach finds nothing readable."*

Suggested order, each stage demo-ready:
1. Accounts, encrypted sync and the AI proxy. Single school, with the school recovery key created at setup.
2. Recovery and admin: school recovery page, export, retention.
3. Demo items from the earlier list: realistic data at scale, report deadline and progress, character limits, editing notes, copy button.
4. Pitch extras: "students you haven't noticed lately", time-saved counter, phone capture.

## 6. Open decisions (needed before the implementation spec)

1. **D or B?**
2. **Microsoft or Google** as the second sign-in?
3. **Supabase access**: allow `supabase.com`, `api.supabase.com` and `supabase.co` in this session's network settings, or run the deploy commands yourself?
4. **Retention default**: delete notebooks how long after the school year ends? (Suggest 60 days, with warnings at 30 and 7.)

## Sources
- Canva student safety: https://www.canva.com/education/schools/student-safety/
- Canva signed agreement (SDPC): https://sdpc.a4l.org/agreements/2025-02-05_12904_16559_signed_agreement_file.pdf
- FTC, Blackbaud order: https://ftc.gov/news-events/news/press-releases/2024/05/ftc-finalizes-order-blackbaud-related-allegations-firms-security-failures-led-data-breach
- The Record, Blackbaud settlement: https://therecord.media/ftc-settles-with-blackbaud-over-data-handling-breach
- TechTarget, PowerSchool breach: https://www.techtarget.com/whatis/feature/PowerSchool-data-breach-Explaining-how-it-happened
- Bitwarden account recovery: https://bitwarden.com/help/account-recovery.md
- Proton, recovery with E2EE: https://proton.me/blog/data-recovery-end-to-end-encryption
- NDPA summary: https://edlaw.eduverse.com/docs/jurisdiction/org/sdpc/ndpa/
- Texas HB 363 analysis: https://capitol.texas.gov/tlodocs/87R/analysis/html/HB00363H.htm
- Passkey PRF support: https://www.corbado.com/blog/passkeys-prf-webauthn and https://bugs.webkit.org/show_bug.cgi?id=311099
