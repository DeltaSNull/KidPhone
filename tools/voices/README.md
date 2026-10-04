# The recorded voice

Every line the toy says is recorded ahead of time with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), an
open text-to-speech model (Apache-2.0), into `assets/voice/`: one small MP3 per line, plus `voice.json`, which tells the
page which clip is which. The page plays them through its sound engine, so the voice mixes with the animals, follows
the volume setting, and works offline once fetched. A line without a clip (a family contact's name) uses the phone's
own voice instead.

- **Who talks**: `speakers.json`. A narrator (`af_heart`, the model's best-rated voice) for prompts and games, and a different voice for each
  animal on the phone, picked for clarity (see *Casting* below).
- **What they say**: read from `index.html` itself (`lines.cjs` asks the page for every line it can say), so a line
  you add to the toy is recorded the next time you run this. Lines the toy assembles while playing ("Hooray!" + "A
  baby T rex!") are recorded sentence by sentence; fixed lines are recorded whole, for a natural rhythm.
- **Processing**: filtered below 80 Hz, voiced for a phone's own speaker (−6 dB below 200 Hz, +2.5 dB around 3 kHz
  for clarity), brought to −21 LUFS as that speaker would play it (it hardly plays anything below 300 Hz, and some
  voices carry more there than others, so measured full-range they'd come out up to 4 dB apart on the phone), at most
  −17 LUFS full-range, limited at −1.5 dB, trimmed, faded, and encoded as 24 kHz mono MP3 at 40 kbps.

## Run it

You need Node (for `lines.cjs`, which uses the repo's Playwright), Python 3.10+, ffmpeg, the model and the voices.

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r tools/voices/requirements.txt

# the model: Kokoro-82M v1.0, ONNX, full precision (about 325 MB)
#   https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx
# the voices: the voices/ folder of the kokoro-js npm package
npm pack kokoro-js@1.2.1 && tar xzf kokoro-js-1.2.1.tgz   # → package/voices/*.bin

python3 tools/voices/make_voices.py --model model.onnx --voices package/voices          # records what's new or changed
python3 tools/voices/make_voices.py --model model.onnx --voices package/voices --check  # and checks every clip
```

Only new or changed lines are recorded (a clip's name is a hash of the speaker, the words and the speaker's settings),
and clips nothing uses any more are deleted. `npm test` checks that every line the toy can say has a clip.

**Respellings**: a few sound words come out wrong from the model ("Grr" is spelled out letter by letter), so
`make_voices.py` respells them for the model only: Grr → Gurr, Brr → Burr, La la la → Lah lah lah, Pawoo → Pah-woo.

## Letter names and sounds

**Names**: a letter on its own ("Find the B!", "That's Q!", "This is s.") goes to the model as the exact phonemes of
its name, spliced into the rest of the line, because respelling it ("Ay") made A come out as "eye", and a bare "A is
for" came out as "uh".

**Sounds**: a line can hold a letter's sound, written `/s/` ("It says /s/, like star!"). Each sound is the narrator
saying a word, cut down to one sound (`SOUND_SRC`: sun, hat, top, hit, pop, ...; x is the end of box), with
pocketsphinx's phoneme aligner finding where the sound starts and stops:

- Short vowels are the steady middle of an h-word (hat, head, hit, hot, hut), where nothing before the vowel colors
  it, stretched to a third of a second. (Cut from apple, itch, octopus and up, the u came out as a different vowel.)
- l, n and m are the steady part of the sound in a word (lap, nap, hum), stretched to half a second; r, v and z come out
  best said held (the phoneme written four times).
- Hisses and puffs (s, f, p, t, c, k, h, x) keep only the voiceless part: the frames with little energy below 1 kHz,
  from the closure before a burst, so there's no "suh" or "puh" after them. s and f are stretched to half a second,
  h to a quarter.
- b, d, g, j, w, y and q end just after the voice starts, which is how teachers say them, with the "uh" as short as it
  goes (b and d from but and duck, so it's "buh", not "ba").
- Each sound is brought to a set loudness against the narrator's speech (the voiceless ones 3 to 5 dB softer than the
  voice): cut from words, a p or k was 14 dB down and would be lost on a phone speaker.
- A letter name said on its own ("T!") is spoken at normal speed: slowed down, T's puff stretched into a hiss that
  sounded like C.
- Those words are said at normal speed: slowed down, the model starts every word with a murmur, an "uh" before the
  consonant. The held sounds and vowels are slowed down, since they're stretched anyway.

The aligner must hear the expected phonemes at the start of each word, or the tool stops.

**How they were checked** (no one can listen from a build machine): Whisper (base.en, run as ONNX) used as a judge that
must choose. For letter names, the line is scored against the same line with each of the other 25 letters ("Find the
T!" against "Find the A!" and so on): every letter wins, in every kind of line. For sounds, a blend test: the sound is
spliced onto the rest of a word cut from the narrator (/s/ + "et") and Whisper picks the word from a set that differs
only in that sound (set, bet, get, jet, let, ...); vowels go between a p and a t (pat, pet, pit, pot, putt). The same
test with each word's own first sound gives the ceiling. With the old cuts 30 of 43 blends were heard right (four of
the five vowels wrong); with these, 39, and the four misses fail with the natural sound too. Listen to them once anyway:
settings, Letter Path, tap a letter, *Hear the sound*. A changed
sound needs `SOUNDS_VERSION` raised, so the lines that use it get new clip names and no phone keeps an old copy.

## Checking without listening

`--check` decodes every shipped MP3 and transcribes it with pocketsphinx, an offline speech recognizer, then lists the
clips whose words came back furthest from the script. pocketsphinx is a rough listener (it garbles short exclamations
even when they're clear), so read it as a comparison: between speakers, and for outliers.

## Casting

Voices were chosen by rendering the same eight longer lines in each candidate voice and transcribing them: the
character voices come from the clearest group. Pitch-shifting a voice up or down (the cartoon chipmunk or giant)
was tried and dropped: even one semitone doubled the transcription errors, so characters differ by voice and talking
speed instead, and every animal stays easy for a toddler to understand.
