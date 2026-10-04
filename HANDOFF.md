# Model handoff

Read SCHOOL_ROADMAP.md first, then AGENTS.md. This is the agreed plan going forward for both Claude and Codex. For “continue,” resume the next unfinished item here after fetching current main and inspecting open PRs.

## Active batch

- None claimed. The next batch is below; whoever starts it records a claim here (model, date, branch) first.

## Last batch: parent access controls (done)

- Status: Done. Codex implemented it; Claude fixed the last CI failure and integrated it, 2026-10-04.
- Merged: [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), rebased onto main as `ca5c487`, `794069e`, `49191c6`. Main run [#26](https://github.com/DeltaSNull/KidPhone/actions/runs/37218633269) passed every test job and deployed to GitHub Pages.
- Scope: P1-01 through P1-07, P1-13 and T-05: parent PIN, School-only/Custom/Full phone, navigation enforcement, camera/call shutdown, permission suppression, local persistence, parent guidance, and the access-control tests.
- Files changed: `index.html`, `tests/parent-controls.cjs`, `tests/smoke.cjs`, `package.json`, `.github/workflows/deploy-pages.yml`, `README.md`, roadmap, and this handoff.

## Implemented behavior

- Full phone remains the initial experience. School-only/Custom require creating and confirming a four-digit PIN. Clock hold opens the PIN gate once configured; changing the PIN happens inside unlocked settings.
- Salted SHA-256 digest and access choices are local under `toyphone.access`; no plaintext PIN is stored. Five wrong attempts trigger a persisted 30-second cooldown. Home, settings completion, and backgrounding close the parent session.
- School-only routes Home and restored/disabled screens to School. Custom has independent app toggles and requires at least one available app. Nested school/game screens inherit their section policy.
- Disabling Camera stops active/pending streams and motion listening. Permission entry points check policy. Disabling Phone ends calls and suppresses incoming/test rings.
- Failed persistence is reported; a failed policy save does not falsely apply it. PIN recovery and Guided Access are documented in README.

## Validation

- Focused Chromium parent-control checks passed, including setup confirmation, wrong/changed PINs, cooldown across reloads, blocked nested routes, Custom selections, calls, live fake-camera shutdown, background relock, and cached offline launch.
- Landscape PIN layout was inspected and adjusted so all keypad rows fit. Final layout checks passed; a restored-Camera startup case was then added for CI.
- Chromium Pages/offline suite passed.
- Existing portrait smoke completed with one failure: its tapAll helper did not scroll to Volume after the new controls pushed it below the viewport. The helper now centers settings-sheet targets before tapping; a direct volume-persistence assertion was added to the focused suite. CI must verify the corrected full suite.
- WebKit browser downloaded, but local host dependencies could not be installed (system package permissions). Run the WebKit suites in GitHub CI; do not claim local WebKit validation.
- Real iPhone Safari/home-screen and family usability checks remain pending. Automated tests do not verify a child's learning.
- Claude: CI run 37204038090 passed every job except Pages/offline (webkit), which stopped at `tests/parent-controls.cjs`'s forced-offline reload: Playwright WebKit on Linux throws an internal browser error reloading a service-worker page after `context.setOffline(true)` (the same limitation `tests/pages.cjs` documents). The WebKit run now checks that a launch under the service worker keeps School-only and that the worker cached the offline shell; Chromium still does the full forced-offline launch. Chromium parent controls re-run locally: all passed. WebKit can't be installed in Claude's container either (download blocked), so CI verifies it.

- Final: every CI job passed on `b128461` ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)): Chromium smoke in portrait, landscape and the short Safari view; Pages/offline and parent controls in Chromium and WebKit; WebKit iPhone smoke. Claude also ran the full Chromium smoke and Pages/offline suites locally on that commit: all passed. The same commit passed again on main in run #26 before deploying.
- Still pending: T-09 real-iPhone checks of the PIN gate, School only and Custom (Safari and home-screen), and family usability.

## Next batch (not started)

Start P1-10, P1-11, and P1-12: separate learner profiles, untracked Together mode, and preservation of legacy shared progress. ABC Snack currently captures its progress object inside its closure and Letter Path does the same; both need deliberate profile switching/reset/loading. Do not simply rename storage keys and accidentally retain the other child's in-memory records. Keep private child details and observations off GitHub.

Then finish P1-08 (session ending) and P1-09 (lesson/effect audio controls), followed by Phase 2. Leave the roadmap as the source of truth for all 56 items.

## Explicitly unfinished / limitations

- No individual profiles, Together learning mode, migration, session limits, or separate lesson/effect audio controls yet.
- Learning scores, tracing skip, lesson progression, and activities are unchanged by this batch. No new lesson narration needs recording.
- Parent policy is still inside the single-file app; gradual module extraction (T-01) remains future work.
- PIN is a toddler-facing settings gate, not device security or a server account. Clearing website storage resets it and may erase progress/photos; README explains targeted vs full recovery.
- Policy is stored per browser/home-screen storage. Configure the copy handed to the child; there is no cloud sync.
- GitHub instructions support switching models, but another model cannot see uncommitted/unpushed edits. Read current branch/PR state before continuing and avoid concurrent edits to the same files.
