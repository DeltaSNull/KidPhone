# School learning roadmap

Created: 2026-10-04  
Review baseline: `413fbb1c45b559d260f58ec98fa59a0279c4e26f`  
Status: Phase 1 in progress — parent access controls merged and deployed ([PR #2](https://github.com/DeltaSNull/KidPhone/pull/2)); profiles, session limits, and audio controls remain open.

**Continuing with either model? Read [HANDOFF.md](HANDOFF.md) and [AGENTS.md](AGENTS.md) before editing.**

## Goal

Build a purposeful learning experience for a preschool learner and a toddler learner while preserving ToyPhone's animals, voices, playful feedback, and offline use. Give parents a protected School-only mode and meaningful evidence of what each child can do.

## Progress tracking

This file is the source of truth for the suggestions from the School review. Check an item only after its implementation and relevant verification are complete. Add a commit/PR link and verification note to the completed item. For work underway, append **In progress**; for a dependency or unresolved decision, append **Blocked — reason**. Update the phase table and change log with each completed batch. Do not mark a phase complete until its acceptance checks pass.

| Phase | Status | Completion evidence |
| --- | --- | --- |
| 1. Parent controls and child profiles | Done except profiles (on hold) | Parent access controls (P1-01 to P1-07, P1-13): [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2). Play time (P1-08) and School sounds (P1-09) done. Profiles, Together play and migration (P1-10 to P1-12) are on hold with progress tracking. |
| 2. Learning foundation and existing activity improvements | In progress | Done without tracking: P2-10, P2-11, P2-12, P2-13. Tracking items (P2-01 to P2-08, part of P2-09) on hold. |
| 3. First guided learning journey | Not started | — |
| 4. Broader curriculum and parent summaries | Not started | — |

Recommended order: Phase 1 → Phase 2 → Phase 3 → Phase 4. Dino Picnic and Animal Delivery are the first new activity priorities. Technical and validation tasks below belong to the phase they support.

## Phase 1 — Parent controls and child profiles

- [x] **P1-01 — Parent PIN:** Keep the clock hold as an entry point and require a parent PIN before changing protected settings. Define setup, change, and recovery behavior. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-02 — Access modes:** Add School only, Custom, and Full phone. Custom independently enables School, Games, Camera, Photos, Music, and Phone. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-03 — School home:** Open directly into School in School-only mode; the Home button also returns to School. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-04 — Navigation enforcement:** Centralize access checks for every entry point, including nested games, shortcuts, restored screens, and app transitions. Hide unavailable icons as well as blocking routes. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-05 — Camera and call shutdown:** End an active camera or call when disabled; suppress incoming calls in School-only mode. Separate Camera app availability from Pretend/Real/Both settings. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-06 — Permission handling:** Skip camera and motion permission requests when those features are unavailable, including startup, settings completion, and resume. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-07 — Persistent restrictions:** Preserve access policy across reloads, closing/reopening, updates, and offline launches. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**
- [x] **P1-08 — Session ending:** Add a parent-controlled session limit with a gentle end after the current activity; require parent authorization to extend it. **Done — Claude: Play time Off/15/30/60 min; heads-up line and a moon in the status bar, the session ends as the child leaves the activity (or at a menu, or after two minutes), then a sleepy-owl break screen that blocks Home and calls and survives reopening; a grown-up starts a new session in settings. Only on-screen time counts; each day starts fresh. Automated checks in `tests/smoke.cjs` (portrait, landscape, Safari bars) pass locally and in CI before deploying; real-phone check pending (T-09).**
- [x] **P1-09 — Audio controls:** Separate essential lesson narration from optional animal sounds and celebrations. Avoid allowing a listening lesson to silently become unanswerable. **Done — Claude: School sounds On/Quieter/Off (animal sounds, crunches, cheers in School go through their own level; outside School they always play); the School and Find It voices are locked on, so a listening question can never go silent. Automated checks in `tests/smoke.cjs` (portrait, landscape, Safari bars) pass locally and in CI before deploying; real-phone check pending (T-09).**
- [ ] **P1-10 — Separate profiles:** Add independent preschool and toddler profiles with their own progress and adjustable starting levels. Keep profile data on the device. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P1-11 — Together play:** Provide an untracked shared mode; do not attribute joint answers to an individual child. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P1-12 — Existing progress migration:** Preserve shared ABC/Letter Path records as legacy history. Do not assign them to either child as demonstrated knowledge. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [x] **P1-13 — Parent guidance:** Explain that the PIN protects in-app settings and Guided Access keeps the child inside the app. **Done — [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), merged as `49191c6`; Chromium and WebKit checks passed in CI ([run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934)) and on main before deploying. Real-iPhone check pending (T-09).**

Acceptance: unavailable sections cannot be reached through Home, nested navigation, restored state, or reload; no disallowed camera/motion prompts appear; disabling a camera stops its stream; profiles and Together play never mix individual progress.

## Phase 2 — Learning foundation and existing activity improvements

- [ ] **P2-01 — Shared skill model:** Define stable skill IDs and store learner, skill, activity, first response, eventual completion, hint/demonstration use, session/date, and example/context separately. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-02 — Honest learning states:** Use Introduced → Practicing → Independent → Remembered later, with explicit, reviewable transition rules. Completion and stars alone must not imply mastery. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-03 — Separate literacy skills:** Track uppercase recognition, lowercase recognition, and sound–letter knowledge independently; replace ABC Snack's combined per-letter evidence. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-04 — Assisted practice:** Keep gentle correction and demonstrations, but record assisted success separately from an independent answer. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-05 — Repeated-tap handling:** Prevent repeated taps or retries within one question from counting as multiple independent successes. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-06 — Review over time:** Revisit skills on later days and use fresh pictures, arrangements, and contexts before labeling them remembered. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-07 — Difficulty adaptation:** Base changes on evidence for the specific skill, rather than number of animals fed or a global streak; retain parent overrides. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-08 — Letter Path completion:** Separate lesson completion/unlocking from evidence of learning; revise “You learned” messages when only practice was completed. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P2-09 — Optional tracing:** Track motor practice separately from letter/sound recognition. Preserve a way to skip without treating the current 25-second fallback as a successful trace. **Partly there; rest deferred — the skip already exists (the next arrow appears during Trace and skipping never says "You made it"); recording motor practice separately is progress tracking, on hold (owner, 2026-10-04).**
- [x] **P2-10 — Consistent teaching sequence:** Align letter lessons and ABC Snack practice around one explicit sequence, while keeping A–Z exploration available. **Done — Claude: ABC Snack introduces letters A to Z (A–F first), the same order as the Letter Path; ABC Zoo stays free A–Z exploration. Automated checks in `tests/smoke.cjs` (portrait, landscape, Safari bars) pass locally and in CI before deploying; real-phone check pending (T-09).**
- [x] **P2-11 — Recognition without color cues:** Add occasional neutral-colored letter checks and varied layouts so fixed letter colors do not supply the answer. **Done — Claude: after the first few animals, about a third of ABC Snack rounds draw every cookie in plain ink, and the Letter Path's last Find round does too. Automated checks in `tests/smoke.cjs` (portrait, landscape, Safari bars) pass locally and in CI before deploying; real-phone check pending (T-09).**
- [x] **P2-12 — ABC/123 Zoo role:** Keep these as exploration and demonstrations; do not count watching or tapping a demonstration as independent skill evidence. **Done by design — ABC Zoo and 123 Zoo record nothing at all; they stay exploration and demonstration (Claude, 2026-10-04).**
- [x] **P2-13 — Counting redesign:** Replace automatic target-sized tray completion with child-selected quantities, add/remove actions, and an explicit Feed/Done choice; retain guided counting as a teaching mode. **Done — Claude: 123 Snack Count myself (default): five or ten boxes that don't reveal the number, add with the basket, tap the boxes to take one back, and a green check to feed; too few/too many is said gently and the wanted boxes glow after two tries. Guided counting stays as the parent setting Help count. Automated checks in `tests/smoke.cjs` (portrait, landscape, Safari bars) pass locally and in CI before deploying; real-phone check pending (T-09).**
- [ ] **P2-14 — Shared lesson structure:** Support review, one new concept, guided practice, a fresh independent example, and an offline follow-through activity.
- [ ] **P2-15 — Accessible interaction:** Preserve spoken prompts, replay buttons, large touch targets, clear visual feedback, and gentle correction; avoid speed-based scoring.

Acceptance: hints, retries, skipped tracing, demonstrations, and joint play cannot generate independent-skill credit. A later independent check can distinguish retained knowledge from completing the same sequence repeatedly.

## Phase 3 — First guided learning journey

- [ ] **P3-01 — Today's Adventure:** Make a short guided sequence the main School entry point while retaining free exploration.
- [ ] **P3-02 — Preschool path:** Offer adjustable lessons in letters/sounds, name recognition, counting and making sets of 1–5, vocabulary, and following directions.
- [ ] **P3-03 — Toddler Play Together:** Offer adult-guided naming, pointing, sound imitation, familiar-object matching, one/more, in/out, open/closed, clapping, waving, and turn-taking. Do not present this as a smaller preschool test.
- [ ] **P3-04 — Dino Picnic:** Reuse animal/food art for “give three snacks”; allow adding/removing snacks and choosing Feed. Vary quantities and arrangements; provide a simpler adult-guided toddler version.
- [ ] **P3-05 — Sound Safari:** Extend the listening-based ABC Snack approach to picture and letter choices with separate sound and letter-name objectives.
- [ ] **P3-06 — Animal Delivery:** Teach directions and vocabulary, starting with “put the apple under the tree,” then combining attributes and quantity when ready. Include simple toddler in/out activities.
- [ ] **P3-07 — Session structure:** Give each adventure a clear beginning and ending, with a manageable mix of review and new material rather than endless auto-advancement.
- [ ] **P3-08 — Offline follow-through:** End with a related action such as bringing three toy animals, finding an object, or following a spoken direction with a parent.
- [ ] **P3-09 — First family trial:** Observe each learner using the appropriate experience. Record usability and teaching changes needed without publishing private child observations in the repository.

Acceptance: both learner paths are usable, the preschool activities require a meaningful choice, and the toddler experience prompts interaction with an adult. Check whether a concept transfers to a new example or real-world action before expanding the catalog.

## Phase 4 — Broader curriculum and parent summaries

- [ ] **P4-01 — Sorting Station:** Match identical objects, then sort by color, shape, or size; later change the sorting rule.
- [ ] **P4-02 — Story Time:** Add short illustrated stories with vocabulary, prediction, simple questions, event ordering, and parent conversation prompts.
- [ ] **P4-03 — Pattern Train:** Complete simple repeating color/size patterns and gradually vary the examples.
- [ ] **P4-04 — Feelings Friends:** Identify feelings and explore helpful responses to sadness, frustration, waiting, and taking turns.
- [ ] **P4-05 — Curriculum coverage:** Map activities to language/literacy, early math, thinking/problem-solving, social learning, and motor/offline experiences; include quantity comparison, spatial concepts, and sequencing.
- [ ] **P4-06 — Parent dashboard:** Show each child's independent skills, assisted practice, recent review, and recommended next activity. Avoid presenting stars or time spent as learning. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P4-07 — Parent observations:** Let a parent record an offline demonstration separately from automatically observed app results. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P4-08 — Actionable summaries:** Explain what was practiced, what still needs help, and one useful next step in plain language. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **P4-09 — Refine progression:** Adjust teaching order, difficulty, and learning-state thresholds based on family observations and varied-example checks, without ranking the siblings.

Acceptance: activities revisit prior skills, progress summaries distinguish evidence types, and parents receive useful next steps beyond “completed another game.”

## Technical work and verification

- [ ] **T-01 — Gradual code organization:** Extract parent policy, profiles, skill tracking, lesson flow, and curriculum data from the large `index.html` as their phases are implemented. Preserve vanilla JS, the existing visual style, and offline deployment; no framework rewrite is required.
- [ ] **T-02 — Data durability:** Version saved progress and verify migrations, reloads, and updates preserve records without mixing profiles. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **T-03 — Audio assets:** Generate recordings for new or changed lesson lines, verify clip coverage and offline availability, and retain iPhone audio behavior.
- [ ] **T-04 — Human phonics review:** Listen to letter names, the 26 sounds, and lesson prompts on an actual phone; check that sounds are clear and appropriate. Automated recognition alone does not complete this task.
- [x] **T-05 — Access-control tests:** Cover mode switching, nested routes, Home, restored state, reload/offline, camera shutdown, permission suppression, and incoming calls. **Done — `tests/parent-controls.cjs`, run in Chromium and WebKit by CI on every PR and push to main ([PR #2](https://github.com/DeltaSNull/KidPhone/pull/2)). WebKit checks the cached offline shell instead of a forced-offline reload, which crashes Playwright WebKit on Linux; Chromium does the full offline launch.**
- [ ] **T-06 — Learning-record tests:** Cover profile isolation, Together mode, legacy migration, first responses, hints, retries, tracing skips, and later-session evidence. **Deferred — owner's decision, 2026-10-04: no progress tracking while the toy is still being tested.**
- [ ] **T-07 — Lesson tests:** Verify counting requires an intentional quantity choice and repeated tapping cannot manufacture independent evidence; verify fresh-example review and session endings.
- [ ] **T-08 — Browser regression checks:** Use the existing Chromium/WebKit and Pages checks for affected behavior, including the /KidPhone/ subfolder and offline assets.
- [ ] **T-09 — Real-phone checks:** Verify Safari/home-screen use, portrait/landscape, touch interactions, Guided Access, sound, and session endings on the actual phone.
- [ ] **T-10 — Documentation upkeep:** Update the README and this tracker as features ship. Attach implementation and verification evidence before checking off tasks.

## Design references

Use these as curriculum/design references, not as claims that app scores diagnose development or establish school readiness.

- [Head Start Early Learning Outcomes Framework](https://www.headstart.gov/interactive-head-start-early-learning-outcomes-framework-ages-birth-five): broad early-learning domains and developmental progressions.
- [NAEYC: Technology and Young Children — Infants and Toddlers](https://www.naeyc.org/node/1354): adult conversation and shared interaction when technology is used.

## Change log

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-10-04 | Claude: Play time (P1-08), School sounds and always-on lesson voice (P1-09), ABC Snack A to Z (P2-10), plain-ink letter checks (P2-11), Count myself 123 Snack with Help count kept (P2-13); P2-12 holds by design. | Smoke tests in three layouts and parent-controls tests pass locally; CI on main before deploying |
| 2026-10-04 | Progress tracking deferred while the toy is being tested (owner's decision): profiles, Together play, migration, the skill model and learning records, and the parent dashboard. Claude took P1-08, P1-09, P2-09, P2-10, P2-11 and P2-13. | [Handoff](HANDOFF.md) |
| 2026-10-04 | Parent access controls merged and deployed (P1-01 to P1-07, P1-13, T-05). Claude fixed the WebKit offline step of the parent-controls test, the last failing CI job. Real-iPhone checks (T-09) pending. | [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2), [run 37212605934](https://github.com/DeltaSNull/KidPhone/actions/runs/37212605934), main run [#26](https://github.com/DeltaSNull/KidPhone/actions/runs/37218633269) |
| 2026-10-04 | Implemented parent access controls and shared Codex/Claude continuation workflow; integration and CI checks pending. | [Handoff](HANDOFF.md) |
| 2026-10-04 | Recorded the reviewed School roadmap and progress checklist. All implementation tasks remain open. | Baseline: `413fbb1`; this documentation commit |
