# Model handoff

Read SCHOOL_ROADMAP.md first, then AGENTS.md. This is the agreed plan going forward for both Claude and Codex. For “continue,” resume the next unfinished item here after fetching current main and inspecting open PRs.

## Active batch

- None claimed. Next untracked candidates: Today's Adventure (P3-01, P3-07, P3-08), Toddler Play Together (P3-03), Sorting Station, Pattern Train, Story Time, Feelings Friends (P4-01 to P4-04). Sound Safari (P3-05) waits on the letter sounds (T-04).

## Owner's feedback, 2026-10-05

- Letter Path uses letter names only until the sounds are right (T-04): "This is a. A is for apple!", "Which one starts with A?", "Which one is a?", "Yes! That's a!". `P_SAY.sound` and the 26 sound clips stay only for the parent page's *Hear the sound*. Don't bring sounds back into lessons until the owner says they're right.
- Animal Delivery has no "on the box" (the box is open: on and in both looked like on top). Spots: in the box (tap the box; the thing sits behind its front, peeking out), on/under the table, under the tree, next to the box. Levels: in the box / on the table, + under the table, + under the tree and next to the box.
- Numbers a grown-up reads in the display font (Pixelify Sans) can be misread: its 5 looks like S and its 2 like 8. The PIN keypad digits and dots, the play-time buttons (15 min, 30 min) and the numbers in the play-time and PIN-wait notes now use `var(--digits)` (Press Start 2P): `.pin-num` on keypad digits, `b.n` around numbers in text. Use `b.n` for any new number shown in the display font.

## Last batch: Dino Picnic and Animal Delivery (done)

- Claude, 2026-10-04, on `main`. Both are School games (`ACCESS_GROUP` school), with School-menu cards; the School menu became a two-column picture grid (four across in landscape) to fit seven cards.
- `Delivery` (P3-06): a 4:3 garden (`#adWorld`, ground at 75%, grass `.ad-ground` running past its edges) with tree/box/table pictures (`SCHOOL_PIX.tree`, `table`, new `ball`), spots `SPOTS` in percent; `LEVELS` add spots after 3 and 6 right in the session (nothing stored). Drag from `#adParcel` or tap a spot; wrong spots are named, the right one glows after two misses. Hook: `delivery()`.
- `DinoPicnic` (P3-04): `.st` layout; snacks scattered on `#dpSpread`, tapped onto `#dpPlate` at shuffled `SLOTS`; plate tap takes back; `#dpFeed` checks; rings after two misses; `settings.count === 'help'` shows rings and auto-eats. Hook: `dinos()`.
- Voice lines recorded (120). Smoke tests cover both games (drag, wrong spot, level step, hint; too many, take back, feed, Help count) in all three layouts.

## Owner's request, 2026-10-04: ABC Snack asks by letter name only

- The letter sounds still don't sound right to the owner, so ABC Snack no longer asks for a sound ("Monkey wants /s/!"): the sound stage, the Sounds setting and those 234 voice clips are gone; a saved `lv: 2` or `abc: 'sound'` becomes little letters. Letter sounds remain only in the Letter Path lessons (and its parent page). Bring sounds back to ABC Snack only when the owner says the phonics audio is right (T-04).

## Last batch: play time, School sounds, Phase 2 without tracking (done)

- Claude, 2026-10-04, directly on `main` (CI tests every push before it deploys).
- P1-08 Play time: `PLAY` in `index.html`; parent setting Off/15/30/60 min (`settings.play`), session in `toyphone.session` ({day, used, ended}). Heads-up "Almost time for a break!" and `#breakIc` moon; ends as `go()` leaves the activity (`PLAY.navigate()`), at a menu after 4 s, or after 2 min; `#breakTime` owl screen blocks Home (go → accessHome) and calls (`ringIn`, `maybeRing`); persists across reloads until Start a new session (`#playReset`), a longer limit, Off, or a new day. Test hooks: `session()`, `playTime(ms)`.
- P1-09 School sounds: a `fx` gain between effects and `master` (the voice bypasses it); `syncFx()` in `go()` applies `settings.schoolFx` (on/quiet/off) in School screens only; `busy()` ignores muted effects so the voice doesn't wait for them. VOICE entries with `need:true` (school, find) are always on (`VOICE_NEED`), shown checked and disabled. Hook: `fxLevel()`.
- P2-10: ABC Snack `ORDER = LETTERS` (A–Z, A–F first). P2-11: `INK` plain-ink glyphs, ~35% of ABC Snack rounds after three animals (`state().plain`, `#asFoods[data-plain]`) and the last Letter Path Find round (`.lp-cards[data-plain]`). P2-13: 123 Snack Count myself (`settings.count`, default `self`): 5 or 10 boxes, basket adds, tapping the frame takes the last back, `#nsFeed` checks; `FEW`/`MANY` lines; boxes glow (`aim`) after two wrong feeds; Help count keeps the old guided flow.
- 23 new voice clips. Tests: smoke (all three layouts) covers all of the above; parent-controls still passes. Real-phone checks are listed in the README's manual checklist.

## Earlier batch: parent access controls (done)

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

## Next batch (deferred: progress tracking, see above)

Start P1-10, P1-11, and P1-12: separate learner profiles, untracked Together mode, and preservation of legacy shared progress. ABC Snack currently captures its progress object inside its closure and Letter Path does the same; both need deliberate profile switching/reset/loading. Do not simply rename storage keys and accidentally retain the other child's in-memory records. Keep private child details and observations off GitHub.

Then finish P1-08 (session ending) and P1-09 (lesson/effect audio controls), followed by Phase 2. Leave the roadmap as the source of truth for all 56 items.

## Explicitly unfinished / limitations

- No individual profiles, Together learning mode, migration, session limits, or separate lesson/effect audio controls yet.
- Learning scores, tracing skip, lesson progression, and activities are unchanged by this batch. No new lesson narration needs recording.
- Parent policy is still inside the single-file app; gradual module extraction (T-01) remains future work.
- PIN is a toddler-facing settings gate, not device security or a server account. Clearing website storage resets it and may erase progress/photos; README explains targeted vs full recovery.
- Policy is stored per browser/home-screen storage. Configure the copy handed to the child; there is no cloud sync.
- GitHub instructions support switching models, but another model cannot see uncommitted/unpushed edits. Read current branch/PR state before continuing and avoid concurrent edits to the same files.
