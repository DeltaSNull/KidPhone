# Model handoff

Read SCHOOL_ROADMAP.md first, then AGENTS.md. This is the agreed plan going forward for both Claude and Codex. For “continue,” resume the next unfinished item here after fetching current main and inspecting open PRs.

## Active batch

- Codex: owner requested a temporary return to regular Games. Branch `codex/motion-games`: Ball Trail and Star Flight, motion/touch controls implemented; PR validation underway. Check this branch/PR before touching index.html. School work resumes after this batch.
- Next untracked School candidates: Today's Adventure (P3-01, P3-07, P3-08), Toddler Play Together (P3-03), Sorting Station, Pattern Train, Story Time, Feelings Friends (P4-01 to P4-04). Sound Safari (P3-05) waits on the letter sounds (T-04).

## Motion games batch — Codex, 2026-10-05

- Owner-directed detour from School: **G-01 Ball Trail**, **G-02 Star Flight**, **G-03 shared motion controls** implemented on `codex/motion-games`. Six regular game cards; both routes belong to Games and remain blocked in School-only mode.
- Ball Trail: steer around two solid hedges into the star garden. Star Flight: catch five drifting stars, with missed stars recycling. No lives, timer, or stored child data. Touch-and-hold works immediately; Use tilt requests permission on a released tap, calibrates the first sample, and Center tilt resets the comfortable grip. Screen rotation recalibrates. Touch overrides tilt, stale samples fall back to touch, and late permission resolutions cannot restart a departed game. No camera permission required.
- Existing pixel sprites and sound effects only; no new narration/audio assets. All code remains inline, so existing offline shell caching covers the games.
- Local verification: motion suite passes Chromium at 390×844, 844×390 and 375×667, including complete touch rounds, sensor movement, hedge collision, recenter, stale sensor, deny, rotation and late permission. Existing parent tests now include both blocked routes. Full smoke/parent test results and PR CI should be checked before merge; validation is still running at this checkpoint.
- WebKit cannot run locally because required host libraries are absent; CI runs the new motion suite in both Chromium and WebKit. **G-04 remains open for real-iPhone permission/grip/rotation/Guided Access and family playtesting.** Do not claim these have been performed.
- Claude: this is the current plan. Read SCHOOL_ROADMAP.md and this handoff first; inspect this branch/PR and its checks before continuing. Finish any failing validation, then real-device feedback. The next School work remains Today’s Adventure; profiles/tracking and phonics stay on hold.

## Current progress review — Codex, 2026-10-04 (America/Chicago)

- Reviewed main `962721c`: 16 of 56 roadmap tasks checked complete (P1: 10, P2: 4, P3: 1, P4: 0, T: 1). Animal Delivery is partly complete; attributes and quantity remain open.
- Latest main [CI run 37251734648](https://github.com/DeltaSNull/KidPhone/actions/runs/37251734648) passed all six test jobs and Deploy. No open PRs at review time. This review checked code and CI evidence; it did not repeat full suites or perform real-iPhone/family testing.
- The `claude/wip-phase3` branch is an older WIP snapshot with divergent history. Main already contains the tested Dino Picnic/Delivery work and subsequent owner-feedback fixes. Do not merge that WIP snapshot blindly or restore its old sounds/on-the-box behavior.
- Next priority: P2-14 + P3-01/P3-07/P3-08 — a short Today's Adventure with a teaching objective, guided practice, fresh example, clear ending, and a real-world action with an adult. Keep it untracked while tracking is deferred. Then P3-03, the dedicated toddler Play Together experience; Help count alone is not that experience.
- Continue honoring the recorded hold on profiles/tracking and on lesson phonics until the owner approves the sounds. Do not implement profiles merely because an older handoff suggested them.
- Documentation contradictions about play-time limits, School sounds, and Letter Path phonics were reconciled in this review. No app code changed.

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

- The letter sounds still don't sound right to the owner, so ABC Snack no longer asks for a sound ("Monkey wants /s/!"): the sound stage, the Sounds setting and those 234 voice clips are gone; a saved `lv: 2` or `abc: 'sound'` becomes little letters. At that point sounds remained in Letter Path; the later owner feedback above removed them from its lessons too. They now remain only in the parent page for review. Bring sounds back to ABC Snack only when the owner says the phonics audio is right (T-04).

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

## Deferred tracking work

P1-10 to P1-12 (profiles, Together progress attribution, legacy migration), the skill model/learning records, and the parent dashboard remain on hold per the owner's decision while testing. Resume only when the owner changes that decision.

If tracking resumes, ABC Snack and Letter Path each capture their progress object inside a closure. Profile switching must reload/reset in-memory state deliberately; changing storage keys alone can mix children's records. Keep private child observations off GitHub.

P1-08 (play-time limits) and P1-09 (School effects/narration controls) are already implemented. Follow the Current progress review and roadmap for the next active work.

## Explicitly unfinished / limitations

- No individual profiles, dedicated toddler Play Together learning journey, or legacy-progress migration yet. Play-time limits and separate School effect/narration controls are implemented.
- Shared letter statistics, stars, and completion-based progression still exist; they should not be treated as proof of independent learning. New counting/Delivery activities are implemented, but guided lesson structure and offline follow-through remain open. Audio assets must be regenerated and checked when lesson wording changes.
- Parent policy is still inside the single-file app; gradual module extraction (T-01) remains future work.
- PIN is a toddler-facing settings gate, not device security or a server account. Clearing website storage resets it and may erase progress/photos; README explains targeted vs full recovery.
- Policy is stored per browser/home-screen storage. Configure the copy handed to the child; there is no cloud sync.
- GitHub instructions support switching models, but another model cannot see uncommitted/unpushed edits. Read current branch/PR state before continuing and avoid concurrent edits to the same files.
