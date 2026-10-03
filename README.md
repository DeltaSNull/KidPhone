# KidPhone

**Play it:** https://deltasnull.github.io/KidPhone/

A pretend phone for a 1.5-year-old and a 3.5-year-old, made to run on Dad's iPhone in Safari under
Guided Access. It's one self-contained `index.html` (vanilla JS, no build step), drawn entirely in pixel art, with five apps:

- **Phone**: animal and dinosaur contacts, a keypad with real touch-tones, and outgoing calls (ringback, then the
  animal answers, makes its call and chats every ~6 seconds until hang-up). Animals also call in every
  1–3 minutes while the kids are on the home screen. It can never place a real call: there are no `tel:` links,
  and phone-number detection is turned off.
- **Camera**: a pretend safari camera. Drag to look around a pixel-art panorama (savanna, jungle, dino valley) about
  3 screens wide. The shutter flashes, clicks and saves a small pixel-art PNG, and (if a parent turns it on) the voice says what's in the shot.
  Each scene has two hidden animals to find. 1×/2× zoom, and the last-photo thumbnail opens Photos.
- **Photos**: the kids' pictures, newest first. Big arrows and swipe, and (if a parent turns it on) the voice names the animals.
  Starts with 4 sample photos. Keeps the newest 40. There's no delete button for kids.
- **Music**: a pentatonic xylophone, drum pads, an animal piano (every key is an animal sound in tune), and
  4 songs with a dancing animal: Twinkle Twinkle, Old MacDonald, The Wheels on the Bus, If You're Happy and You Know It.
- **Games**: a controller icon that opens a game picker. Each card says who it's for: "1 player" with one little kid, or
  "1 or 2 players" with two (numbers are in the 8-bit digit font, so a 2 never reads as an 8). A game for 1 or 2 asks
  first, with two big buttons: one kid, or two kids. The last choice glows.
  - *Wild Tap Safari* (1 player): Safari, Zoo and Dino sound boards, Find It, egg hatching and bubble popping.
    Its grid button goes back to the Wild Tap menu.
  - *Snack Time* (1 player): a hungry animal walks in, thinking of a food in a thought bubble. Tap that food on the picnic
    blanket and it flies into the animal's mouth: munching, the animal's call, hearts and a sticker, then the next animal
    walks in. Two foods to choose from at first, three after a few animals. A wrong food only gets a gentle head shake, and
    after two tries the right food glows, so there's no way to lose. Every fifth animal is a little party. The bubble
    shows the food, so the game works with the voice off (with Animal names on, it also says "The panda wants some bamboo!").
    Eleven animals: monkey and banana, penguin and fish, puppy and bone, panda and bamboo, giraffe and leaf, chick and corn,
    turtle and strawberry, parrot and blueberry, frog and fly, hippo and watermelon, cow and flower.
  - *Dino Buddies* (1 or 2 players): the split-screen game for both boys. Every tap on either half flies a treat into one
    shared egg. With 1 player, one big dino fills the screen and the egg needs fewer treats (16 instead of 24).
    The hatched family is remembered between visits.
  - *Paint Pals* (1 or 2 players): split screen again, with a coloring page of an animal on each half. Rubbing a finger over it
    paints it in its real colors, each half with its own notes on one shared scale, so two kids painting at once still
    sounds like music. Tapping beside the picture flings a blob of paint onto it, so the little one can tap instead of
    rub. When a picture is nearly painted it finishes itself and the animal calls out. When both are done, the two
    animals dance and call to each other, go up on the shelf in the middle (remembered between visits), and a new pair
    arrives: lion and giraffe, puppy and kitty, monkey and parrot, cow and chick, T. rex and long neck, and seven more.
    With 1 player, one big coloring page fills the screen and the same animals come one at a time.

## Animal voices

The animals' calls are modeled on the real animals: a buzzing "vocal cord" source shaped by throat and mouth
resonances, with the real call's pitch swoops, growl (roughness) and breath. Each stays under about 2 seconds and
mid-volume, and the animal finishes its call before it talks.

| Animal | Its call |
| --- | --- |
| Lion | a deep, rough, rising-and-falling roar, then two grunts |
| Elephant | a bright, brassy, wobbly trumpet |
| Giraffe | a low, soft hum (giraffes really hum), then munching |
| Zebra | a whinny: a high trilling squeal sliding down, then a soft nicker |
| Monkey | a chimp pant-hoot: hoots that speed up and climb, then excited screams |
| Penguin | an African penguin's donkey-like bray, "haa haa hee-haaaw" |
| Hippo | a wheeze-honk: a squeaky in-breath, then deep rhythmic honks |
| T. rex | a deeper, growlier roar with a soft rumble under it |
| Long neck | a low, gentle "hoooom", then two big footsteps |
| Triceratops | two nose snorts and a grunt |
| Stegosaurus | a rumbly grunt, a tail swish and a thump |
| Pterodactyl | a raspy, hawk-like "keee-ahh" |
| Dog | two quick, bright barks |
| Cat | a "mee-ow": the mouth opening, then closing |
| Duck | two nasal quacks |

The camera scenes and Wild Tap use the same voices (plus a leopard and tiger growl, parrot squawk, flamingo honk,
gorilla chest beats, frog ribbit, owl hoot and more).

**Real recordings:** a synthesizer only gets so close. To use real recordings (for example, ones you make at the zoo),
drop them in `assets/sounds/` and list them in `sounds.json`. See [`assets/sounds/README.md`](assets/sounds/README.md).

The big yellow home button is always in the same spot and always goes home. The talking voice speaks only where a parent
turns it on in settings (phone calls and Wild Tap's Find It to start with), every tap answers
on `pointerdown` with sound and motion, there are no failure states, and two kids can tap at once.

![Portrait screens](screenshots/portrait.jpg)
![Landscape screens](screenshots/landscape.jpg)

## Pixel art

Every picture is pixel art placed one pixel at a time: no emoji, no vector drawings, no photos except your family's.

- **Sprites** live in `index.html` as text, in the `PIX` block: a palette, then one row of letters per row of pixels.
  Each letter is a color and `.` is see-through. Edit a row, reload, and the picture changes everywhere.
  There are 100: 37 animals and dinosaurs (32×32, facing left), 7 little 16×16 animals for far away in the camera,
  32 things and treats (Snack Time's foods and Paint Pals' brush among them), the 5 app icons, 18 buttons, checkmarks,
  player badges and status-bar icons, and the toy's own home-screen icon.
  `npm run sprites` draws them all on one sheet:

  ![Every sprite](screenshots/sprites.png)

- **The camera world** is painted on a grid of 640×200 pixels (5 world units per pixel), sky and ground in flat
  bands with a little ordered dither where they meet. Trees, ponds, rocks, palms and the volcano are painted with the
  same tools as the sprites (shapes, then shading and an outline), and the scene is scaled up with hard edges. Animals are
  drawn at whole-number sizes and never rotated: they walk, hop and peek, and sway by shuffling one pixel.
- **Buttons, cards and backgrounds** are pixel pictures too, painted by the script on a 3-CSS-pixel grid: frames with
  notched corners for every button (CSS `border-image` stretches the middle), round pixel buttons, and a background for
  each screen painted to fit it and repainted when the screen changes size.
- **Fonts**: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) for words and
  [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) for numbers (its 3, 5 and * are easy to tell apart).
- **Photos** are saved at one pixel per art pixel and shown scaled up with hard edges, so they stay sharp and small.

## Put it on the phone

1. **Put it online over HTTPS.** Pick one:
   - **GitHub Pages (public, easiest):** the workflow in `.github/workflows/deploy-pages.yml` publishes the toy
     whenever it changes on `main`, at **https://deltasnull.github.io/KidPhone/**. One-time setup in the repository on GitHub:
     **Settings → Pages → Build and deployment → Source: GitHub Actions**. On a free GitHub plan the repository must
     be public for Pages to work (Settings → General → Danger Zone → Change visibility). To publish by hand:
     Actions → *Deploy to GitHub Pages* → **Run workflow**. Only the toy is published: no tests, tools or
     `assets/family/`. Anyone with the link can open it, so family contacts don't work there.
   - **Your own server (private, needed for family contacts):** any static file server works (Caddy, nginx, a NAS
     web server). Upload `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` and `assets/` (with
     `assets/family/` if you add family contacts).

   Every link in the page is relative, so it works at a domain's root or in a subfolder like `/KidPhone/`.
2. On the iPhone, open the URL in Safari, then **Share → Add to Home Screen**. Opened from that icon, it runs full screen
   with no Safari bars, and it keeps working offline once loaded (the service worker caches it).
3. **Guided Access**: Settings → Accessibility → Guided Access → on, and set a passcode. Open Toy Phone, then
   triple-click the side button to start. Triple-click and enter the passcode to leave.
4. **Nicer voice**: Settings → Accessibility → Read & Speak → Voices → English (on iOS 18 and earlier it's
   *Spoken Content* instead of *Read & Speak*). Download an *Enhanced* or *Premium* voice, such as Samantha (Enhanced),
   then reload the page. The page prefers a downloaded Enhanced or Premium voice, and the parent settings panel shows
   which voice it's using. If it still says the basic Samantha, Safari isn't offering the downloaded voice to web pages.

Home-screen apps keep their own storage, so photos taken there don't show up in Safari's copy, and the reverse.

## Parent settings

Hold the clock in the top-left corner for **3 seconds**. A quick tap only wiggles it, so toddlers won't get in by accident.

- Incoming calls on/off
- Volume (Quiet / Soft / Medium / Loud)
- **Voice**: a checkbox for each place the talking voice can speak. Animal sounds and music always play.

  | Checkbox | What the voice says | Starts |
  | --- | --- | --- |
  | Phone calls | The animals talk when you call them and when they call you | on (a call is the animal talking) |
  | Wild Tap: Find It | "Where is the giraffe?" | on (the game is the question) |
  | Opening apps | "Hi buddy!", "Phone! Who do you want to call?", "Tap the egg!" | off |
  | Animal names | The animal's name after its sound, Wild Tap facts, hatched babies, what each Snack Time animal wants, finished paintings | off |
  | Camera and Photos | The animals in view and in each picture | off |
  | Keypad numbers | Each number pressed | off |
  | Music | Instrument and song names | off |

- Clear photos, with a confirm step built into the page
- Ring now and Test sound, for checking the phone
- Which speech voice is in use, and how many family contacts loaded

## Family contacts

Contacts with a real photo and recorded voice clips ("Hi buddy, it's Daddy!"). See
[`assets/family/README.md`](assets/family/README.md). That folder is git-ignored apart from its README and example,
so private voices and faces stay on your server.

## Check on the real iPhone

The automated test runs in Chromium, so these need a person and the phone:

- [ ] Sound plays on the very first tap
- [ ] The animal calls, drums and ringtones play, and keep playing after the voice talks. If the voice works but the
      sound effects are quiet, flip the ring/silent switch to ring (parent settings shows whether the sound engine is on)
- [ ] The speech voice sounds right (Enhanced voice downloaded?)
- [ ] The animal calls sound right on the phone's speaker. They were checked here with spectrograms, not by ear
- [ ] Guided Access session: nothing leads out of the page
- [ ] Portrait and landscape
- [ ] Two kids tapping at once
- [ ] Listen to *If You're Happy and You Know It*. Its melody was written from memory, so check it by ear
      (notes live in the `SONGS` list in `index.html`)

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole toy (HTML, CSS and JS in one file) |
| `manifest.webmanifest`, `icons/` | Add to Home Screen name and icons (PNGs made from the `appIcon` sprite) |
| `sw.js` | Offline cache: network first, so updates show up on the next launch |
| `assets/family/` | Private family contacts (see its README) |
| `assets/sounds/` | Optional real animal recordings (see its README) |
| `tests/smoke.cjs` | Playwright smoke test |
| `tests/pages.cjs` | GitHub Pages check: builds the site like the workflow, serves it under `/KidPhone/` and opens it as an iPhone and an Android phone |
| `.github/workflows/deploy-pages.yml` | Publishes the toy to GitHub Pages |
| `tools/make-icons.cjs` | Makes the home-screen icon PNGs from the `appIcon` sprite |
| `tools/sprite-sheet.cjs` | Draws every sprite on one sheet (`screenshots/sprites.png`) |
| `tools/make-artifact.cjs` | Builds the claude.ai artifact version (no PWA bits) |

## Develop and test

```sh
npm install        # Playwright + the two pixel fonts for offline test rendering
npm test           # iPhone portrait 390×844, landscape 844×390, and 390×664 (Safari with bars)
npm run test:pages # the published site, served from a /KidPhone/ subfolder like GitHub Pages
npm run sprites    # draws every sprite on screenshots/sprites.png
npm run icons      # after editing the appIcon sprite
npm run artifact   # writes dist/artifact.html
```

The test taps every button on every screen, places and hangs up calls, takes photos, plays every instrument and a song,
plays every Wild Tap screen, hatches a Dino Buddies egg with two fingers at once, feeds Snack Time animals (wrong food
first), paints both Paint Pals pictures with two fingers at once until the pair goes up on the shelf, plays Dino Buddies
and Paint Pals again as 1 player, opens parent settings
with a 3-second hold, mashes 250 random touches (some two-handed), then checks the home button still gets home. It also
renders all 24 animal calls offline to check each is audible, under 2.5 seconds and not clipping, and it fails on any
console error. Screenshots go to `tests/screenshots/`.

## Notes

- Photos are stored in `localStorage` as small pixel-art PNGs (a few KB each, one pixel per art pixel). If the phone runs out of room, the oldest
  photo is dropped first. Clearing Safari's website data deletes them. The sample photos from an older version are swapped
  for pixel ones the first time this version runs; photos the kids took are kept.
- **Sound effects and the voice on iPhone.** The page sets its audio session to `ambient` so the sound effects mix with
  the speech voice. With `playback`, the effects would also play through the silent switch, but on iPhone every spoken
  sentence then takes the speaker from the sound effects and Safari doesn't give it back, so the animals go quiet. The
  catch: like most web pages, the effects follow the ring/silent switch. If iOS pauses the sound engine anyway (a phone
  call, Siri), sounds asked for meanwhile are held and play on the next touch, and an engine that won't restart is
  replaced. The voice waits for a sound to finish rather than talking over it.
- A call nobody hangs up says goodbye by itself after 3 minutes (`CALL_MAX_MS`), so a forgotten phone doesn't chat all afternoon.
- In portrait, the 8 xylophone bars and 8 piano keys are about 66px tall but span the full width. Every other kid control is 80px or more.
- With five app icons, the three animals on the home-screen hill only show on tall portrait screens (800px or more).
- Every picture is a pixel sprite in `index.html`, so the toy looks the same on every phone, and walking animals always face the way they walk. The test fails if an emoji or an SVG sneaks back in, or if a sprite has uneven rows or a letter with no color.
- Camera and microphone ideas (selfie stickers, talk-back calls) need this self-hosted HTTPS setup. claude.ai artifacts block both.
