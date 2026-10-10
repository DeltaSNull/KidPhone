# Model handoff

Read SCHOOL_ROADMAP.md first, then AGENTS.md. Before changing code: fetch main, check open PRs and branches, and claim
the work under *Active batch*. Keep this file short: what's true now, the owner's decisions, how things are built, and
what's open. Each batch's full story lives in its PR and commit messages; the history at the end links them. (Condensed
on 2026-10-09 from a 6,400-word log; the old text is in git history.)

## Active batch

- **Claude, 2026-10-10: usability and reliability pass after PR #19 (owner's request), R-24 to R-30**, one PR per
  batch: R-24 story narration and replay (`claude/story-narration`), then accessibility/legibility, learning
  shortcuts and size/audio verification, read-together stories and flexible Feelings, offline readiness, navigation.
- Next candidates, in order: physical checks with the family (R-04, G-04, T-09); Today's Adventure (P3-01, P3-07,
  P3-08); Toddler Play Together (P3-03); consistent game controls (I-06). Sound Safari (P3-05) waits on T-04.

## Owner's decisions in effect

- **Progress tracking is on hold** while the family tests: no profiles, skill records, Together attribution, migration
  or dashboard (P1-10 to P1-12, P2-01 to P2-09, P4-06 to P4-08, T-02, T-06). Store nothing about a child.
- **Letter sounds stay out of the lessons** until the owner says they sound right (T-04). Letter Path and ABC Snack ask
  by letter name only ("Which one starts with A?", "Puppy wants an S!"); the 26 sounds play only on the parent page.
- **Animal Delivery has no "on the box"** (on and in both looked like on top of the open box).
- **Numbers use the clear 8-bit digits everywhere** (Pixelify's 5 looked like S, 2 like 8): the display font routes
  every digit to an embedded Press Start 2P face, so nothing extra is needed for new numbers (R-19).
- **Parent PIN is optional, off by default** (P1-14). Restrictions work without it; Settings says a child can learn the
  clock hold when School only or Custom is on without a PIN.
- **Feelings Friends must not show the feeling before it's asked** (it became a matching game): a short story first,
  the face only after the answer (R-21).
- **Star Flight's long animal-food journey came from the owner's feedback** (PR #4: 8/10/12 foods per animal, six
  animals). Don't shorten it without asking; family testing (G-04) decides.
- **Standing approval:** the owner allows publishing, merging and deploying changes that pass CI ("Always allow",
  "Proceed with what's necessary to make the changes live"). Ask before anything that would lose data or history.
- **Never:** a real call (`tel:` links), `alert()`/`confirm()`, the family's clips or photos in the repo, copies of
  Apple's iOS screens, icons or branding. Leave the old DeltaSNull/Claude repo alone.

## How it's built (what to keep consistent)

- One `index.html` (no build step) plus `assets/`, `sw.js` (offline) and `tests/`. Each app is a module with
  `enter`/`leave` called from `enterApp`/`leaveApp`, and `go()` navigates (it clears `later()` timers and the voice).
  Games: `WildTap`, `SnackTime`, `DinoBuddies`, `PaintPals`, `MotionGames` (Ball Trail, Star Flight). School: `AbcZoo`,
  `NumZoo`, `LetterPath`, `AbcSnack`, `NumSnack`, `DinoPicnic`, `Delivery`, `SchoolAdventures` (Sorting Station,
  Pattern Train, Story Time, Feelings Friends). Parent side: `ACCESS_GROUP`/`appAllowed` (a new app must be listed or it
  is blocked), settings, `PLAY` (play time). Test hooks are on `window.__toyPhone` (e.g. `adventure()`,
  `motionGames()`, `delivery()`, `dinos()`, `voiceMissing()`).
- **The kids can't read.** On their screens: pictures and short spoken lines (about ten words at most), picture buttons
  in the pixel frames (`--fr`) or discs (`--disc`), the berry speaker to hear it again, stars for progress, a gentle
  "uh-uh" plus a hint for a wrong answer and a glow after two, no timers and nothing to lose. Words are for the
  grown-up only (settings, the small "Together:" idea on School end screens).
- **Taps:** kid controls answer on touch-down (`tap()`); lists and cards use `tapInScroll()` (acts on lift; a scroll
  cancels it; a toddler may slide 36px, settings only 14px).
- **Look:** painted backgrounds come from `BG` painters registered in `BGS` (a section created later must register
  itself with `bgFor`/`bgWatch`); frames and discs are CSS variables; pixel sprites are `ART.*`, `schoolPic()` and
  `pixelPicture()`.
- **Voice:** every spoken line is listed by its module's `lines()` and recorded with Kokoro:
  `python3 tools/voices/make_voices.py --model kokoro-fp32.onnx --voices voices.npz` (see tools/voices/README.md; it
  records only what's new and prunes unused clips). Then `window.__toyPhone.voiceMissing()` must be empty. Voice areas
  `school` and `find` always speak; the others follow Settings ("Opening apps" is off by default).
- **Motion:** only a grown-up's tap asks Safari (the getting-ready card, *Move the phone*, *Tilt and touch*, Done);
  games never call `requestPermission`.

## Tests and CI

- CI (`.github/workflows/deploy-pages.yml`) runs the smoke test in portrait, landscape and short-Safari layouts, the
  WebKit iPhone smoke, and two Pages/offline jobs (Chromium and WebKit) that also run: text-legibility,
  parent-controls, break-preview, motion-games, school-activities, delivery-expanded, social-play, social-lifecycle,
  refinement, play-refinement, audio-return, phone-game-review, camera-peek and delivery. Main deploys only when all
  pass.
- WebKit can't run in either model's container; CI is the WebKit check. Run the focused suites you touch plus the
  smoke test locally before pushing.
- Tests should tap the way kids do (`page.touchscreen.tap`), not only keyboard Enter or synthetic clicks.
- WebKit in CI has hung waiting for a reload's "load" event right after parent-controls' background/foreground check
  (runs #76 and #87, twice each). That test now taps once after coming back (rebuilding the parked sound) and its
  reloads wait for the page to commit and the toy to be ready; a late "load" is logged. Not reproducible here.
  WebKit's browser also died once in camera-peek's third layout (heavy pixel checks in one shared browser); each
  layout now gets its own browser.

## Open, not done

- Physical checks: real iPhone (Safari and home screen, Guided Access, sound after sleep, tilt grip) and a family
  playtest of the newer games (R-04, G-04, T-09). Nothing in the browser tests proves a child can use it.
- The first-time voice warm-up downloads every narrator clip (about 17 MB); warming only the apps that are switched on
  would save data.
- Much of the newer code is packed into long single lines; reformat a module when you next change it (T-01 also wants
  gradual extraction).

## History (newest first)

- 2026-10-10 R-27 stories and feelings (Claude): Story Time's shelf has two mode buttons ("?" = questions, the
  default; grown-up and child = read together, `mode`, not saved). Reading together, pages are read and wait for
  the grown-up's arrows (`.sa-turns`), each with a written idea (`talk` in `BOOKS`), no questions. Feelings: every
  second page states the friend's own reaction; the help round accepts two kind answers (`rights`, `HELP_FOR` lists),
  "Duck can ask for a hug!" instead of assuming one. New tests/stories-together.cjs.

- 2026-10-10 R-26 learning shortcuts and verification (Claude): Pattern Train's size train asked for "small" every
  time with two big decoys; now two answers (same shape and color, one of each size) and either size can be next.
  Trains are 4 or 5 cars long; the order is AB colors, AB animals, AB sizes, AAB, ABC, each new kind after a
  demonstration train (`demoRound`: whole train, cars hop with notes; "Watch the train!", "A new train! Watch!",
  "Now you! What comes next?"). Sorting's "same size" has two answers (it was the odd one out of three); its two
  cards keep the three-card width (`.sa-sized`) so the drawn shapes still match the picture. The size train's squares
  nearly fill their wagons (`saShape(..., full)`). Xylophone taper made geometric (`.3 * .91 ** i`; the top bars
  were ~3 dB louder on a phone speaker). New test hooks `adventurePlan`, `adventureJump`, `renderMix`, `voiceFile`;
  new tests/learning-rounds.cjs and tests/audio-mix.cjs (modelled; physical listening is still R-04).

- 2026-10-10 R-25 accessibility and legibility (Claude): the status bar is no longer `aria-hidden` (only its icons);
  the clock is "Parent settings: hold for 3 seconds" (the hold is still the gate); `shield()` makes the screen inert
  behind Settings and the PIN screen (Home stays live, like a phone's button); cancelling the PIN returns focus to
  the clock; the PIN screen announces "2 of 4 digits entered". Digit audit over every screen with numbers: one
  real problem, the photo counter and camera zoom inherited bold and the one-weight 8-bit font was faked bold
  (fixed with `font-weight:400`). White Done/Start/Delete labels (2.4:1 on green) got the ink outline. Reduced
  motion: CSS loops play once, `fly()` makes the JavaScript snack/treat flights instant. New tests/accessibility.cjs.

- 2026-10-10 R-24 story narration and replay (Claude): a story page turns a moment after its line has been heard,
  judged by the sound (`say(text, who, area, then)`: the last clip's end, the phone voice's end, a slow clip waited
  for up to 8 s, a line held for a stopped engine kept for the next tap); the speaker and the picture both re-read
  the current page and the page waits; leaving, Settings and the background stop it, and coming back re-reads the
  page or moves on from an answered round. New tests/story-narration.cjs (CI, Chromium and WebKit).

- 2026-10-09 R-23 consistency pass (Claude): drums and animal piano leveled for a phone speaker through the compressor
  (`renderPad` test hook; smoke checks the spread); Sorting's target on an answer-sized card and a one-shape "same size"
  round; Pattern Train's big-and-small answers at car size; no stretched answer pictures; kitty eats fish, stegosaurus
  ferns; Feelings' unkind choice is `schoolPic('grab')`, not the "wave" hand.
- 2026-10-09 R-22 Story Time shelf (Claude, [PR #18](https://github.com/DeltaSNull/KidPhone/pull/18)): Story Time
  opens on a shelf of covers; Duck's Garden (water pail page), Owl and the Egg, Frog's Rainy Day. Stories are data in
  `BOOKS`, pictures in `STORY_CARDS` (40x32, drawn with `Pix`). Feelings' help pictures: a grown-up holding a child's
  hand, a face blowing a pinwheel (`schoolPic('grownup')`, `schoolPic('blow')`).
- 2026-10-09 R-21 Feelings Friends as stories (Claude, [PR #17](https://github.com/DeltaSNull/KidPhone/pull/17)): a
  two-page story per friend (two per feeling, eight friends), then "How does Owl feel?" with the face hidden until it's
  named. New props in `saProp()`.
- 2026-10-09 R-20 kid-friendly pass (Claude, [PR #16](https://github.com/DeltaSNull/KidPhone/pull/16)):
  Sorting/Pattern Train/Story Time/Feelings rebuilt for pre-readers (pictures, short lines, three shuffled answers,
  varied rounds, stars, auto-advance), Sorting's exact match fixed, picture buttons for call missions, Delivery's
  More, motion replay and the Dino/Paint extras, forgiving card taps, School-only-without-PIN note, this handoff
  condensed. New tests/school-activities.cjs.
- 2026-10-08 R-19 legibility (Codex, [PR #15](https://github.com/DeltaSNull/KidPhone/pull/15)): clear digits
  everywhere via an embedded number font; readable settings text; contact names and short-screen menus.
- 2026-10-07 expansion (Codex, [PR #14](https://github.com/DeltaSNull/KidPhone/pull/14)): Delivery quantity/color/size
  rounds; Ball Trail mazes with a dotted route; Star Flight animal journey; call hello game; Dino Buddies turns; Paint
  Pals prompt and picture shelf; Sorting, Pattern Train, Story Time, Feelings (P4-01 to P4-04).
- 2026-10-06 (Codex): School layouts and play-time preview, R-16 to R-18 ([PR #13](https://github.com/DeltaSNull/KidPhone/pull/13));
  complete contact portraits, R-15 ([#12](https://github.com/DeltaSNull/KidPhone/pull/12)); pretend-camera animals hide
  behind cover, R-14 ([#11](https://github.com/DeltaSNull/KidPhone/pull/11)); centered Call button and stale game
  animations, R-11 to R-13 ([#10](https://github.com/DeltaSNull/KidPhone/pull/10)); sound back after the phone sleeps
  and a toy-style piano duck, R-09/R-10 ([#9](https://github.com/DeltaSNull/KidPhone/pull/9)); natural mallard quack,
  R-08 ([#8](https://github.com/DeltaSNull/KidPhone/pull/8), credited in assets/sounds/CREDITS.md).
- 2026-10-05 (Codex): question replay, take-one-back and photo browsing, R-05 to R-07 ([#7](https://github.com/DeltaSNull/KidPhone/pull/7));
  scroll-safe settings with shortcuts and keyboard support, R-01 to R-03 ([#6](https://github.com/DeltaSNull/KidPhone/pull/6));
  optional PIN and the nine-stop Delivery route, P1-14/P3-06 ([#5](https://github.com/DeltaSNull/KidPhone/pull/5));
  two-axis rolling ball and Star Flight stages, G-05/G-06 ([#4](https://github.com/DeltaSNull/KidPhone/pull/4)).
- 2026-10-05 motion games (Codex, then Claude, [PR #3](https://github.com/DeltaSNull/KidPhone/pull/3)): Ball Trail and
  Star Flight, the *Tilt games* setting, no permission prompts in front of the kids. Same day (Claude, on main): Letter
  Path by letter name, Delivery without "on the box", clear PIN digits, parent-test reload fix.
- 2026-10-04 (Claude, on main): Dino Picnic and Animal Delivery (P3-04, P3-06); play time, School sounds and Phase 2
  without tracking (P1-08, P1-09, P2-10, P2-11, P2-13); counting games. (Codex, [PR #2](https://github.com/DeltaSNull/KidPhone/pull/2)):
  parent PIN, School only, Custom, access enforcement (P1-01 to P1-07, P1-13, T-05).
