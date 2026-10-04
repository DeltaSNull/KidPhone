# Model handoff

Read SCHOOL_ROADMAP.md first, then AGENTS.md. This is the agreed plan going forward for both Claude and Codex. For “continue,” resume the next unfinished item here after fetching current main and inspecting open PRs.

## Current batch

- Status: In progress — Codex, 2026-10-04; implementation complete, validation/integration underway.
- Branch: `codex/school-parent-controls` (based on `ddee957`); [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2).
- Scope: P1-01 through P1-07 and P1-13: parent PIN, School-only/Custom/Full phone, navigation enforcement, camera/call shutdown, permission suppression, local persistence, and parent guidance.
- Files changed: `index.html`, `tests/parent-controls.cjs`, `package.json`, `.github/workflows/deploy-pages.yml`, `README.md`, roadmap, and this handoff.
- Do not duplicate the active batch. Inspect its PR and CI first. Changes are not available on the live site until integrated and deployed.

## Implemented behavior

- Full phone remains the initial experience. School-only/Custom require creating and confirming a four-digit PIN. Clock hold opens the PIN gate once configured; changing the PIN happens inside unlocked settings.
- Salted SHA-256 digest and access choices are local under `toyphone.access`; no plaintext PIN is stored. Five wrong attempts trigger a persisted 30-second cooldown. Home, settings completion, and backgrounding close the parent session.
- School-only routes Home and restored/disabled screens to School. Custom has independent app toggles and requires at least one available app. Nested school/game screens inherit their section policy.
- Disabling Camera stops active/pending streams and motion listening. Permission entry points check policy. Disabling Phone ends calls and suppresses incoming/test rings.
- Failed persistence is reported; a failed policy save does not falsely apply it. PIN recovery and Guided Access are documented in README.

## Validation so far

- Focused Chromium parent-control checks passed, including setup confirmation, wrong/changed PINs, cooldown across reloads, blocked nested routes, Custom selections, calls, live fake-camera shutdown, background relock, and cached offline launch.
- Landscape PIN layout was inspected and adjusted so all keypad rows fit. Final layout checks passed; a restored-Camera startup case was then added for CI.
- Chromium Pages/offline suite passed.
- Existing portrait smoke completed with one failure: its tapAll helper did not scroll to Volume after the new controls pushed it below the viewport. The helper now centers settings-sheet targets before tapping; a direct volume-persistence assertion was added to the focused suite. CI must verify the corrected full suite.
- WebKit browser downloaded, but local host dependencies could not be installed (system package permissions). Run the WebKit suites in GitHub CI; do not claim local WebKit validation.
- Real iPhone Safari/home-screen and family usability checks remain pending. Automated tests do not verify a child's learning.

## Next actions for this batch

1. Finish the portrait smoke run and inspect any failures.
2. Run/inspect CI for this branch, including both parent-control engines and existing gates. Resolve failures without weakening assertions.
3. Recheck current main for concurrent Claude changes, integrate without overwriting them, then verify deployment.
4. Check off verified roadmap tasks and update this handoff with final commit/PR, test results, and remaining limitations.

## Next implementation batch after integration

Start P1-10, P1-11, and P1-12: separate learner profiles, untracked Together mode, and preservation of legacy shared progress. ABC Snack currently captures its progress object inside its closure and Letter Path does the same; both need deliberate profile switching/reset/loading. Do not simply rename storage keys and accidentally retain the other child's in-memory records. Keep private child details and observations off GitHub.

Then finish P1-08 (session ending) and P1-09 (lesson/effect audio controls), followed by Phase 2. Leave the roadmap as the source of truth for all 56 items.

## Explicitly unfinished / limitations

- No individual profiles, Together learning mode, migration, session limits, or separate lesson/effect audio controls yet.
- Learning scores, tracing skip, lesson progression, and activities are unchanged by this batch. No new lesson narration needs recording.
- Parent policy is still inside the single-file app; gradual module extraction (T-01) remains future work.
- PIN is a toddler-facing settings gate, not device security or a server account. Clearing website storage resets it and may erase progress/photos; README explains targeted vs full recovery.
- Policy is stored per browser/home-screen storage. Configure the copy handed to the child; there is no cloud sync.
- GitHub instructions support switching models, but another model cannot see uncommitted/unpushed edits. Read current branch/PR state before continuing and avoid concurrent edits to the same files.
