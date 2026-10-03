# The animal recordings

`make_sounds.py` builds the toy's real animal sounds in `assets/sounds/` from freely licensed recordings on
[Wikimedia Commons](https://commons.wikimedia.org/). The page plays a recording wherever that sound is used (calls,
Wild Tap, the camera, the games), and falls back to the synthesized call for anything without one.

- **`sources.json`** says where each sound comes from: a Commons file and the seconds to cut out of it, or, for the
  dinosaurs (nobody has recorded one), layers of real animals slowed down and mixed, the way film sound designers
  build dinosaurs out of elephants, lions and alligators.
- **Licenses**: the script reads each file's license from Commons and stops unless it's public domain, CC0, CC BY or
  CC BY-SA. It writes `assets/sounds/CREDITS.md` with the author, license and link for every recording used.
- **Made for a phone speaker**: the toy plays on the phone's own speaker, which plays almost nothing below 300 Hz (a
  lion's roar loses 9 dB there, a slowed-down T. rex 13 dB). So each sound's loudness is measured through a model of
  that speaker (18 dB an octave below 350 Hz) and set to −24 LUFS there, the same as the synthesized calls, but never
  louder than −19 LUFS full-range, so headphones don't get a blast. Deep sounds use `shelf` (less below 250 Hz) and
  `presence` (more around 1.1 kHz, where the speaker is loudest) to move their weight up where it can be heard.
- **Processing**: high-passed, cut, edges faded so a cut can't click, trimmed of quiet ends, levelled as above,
  limited at −1 dB, and encoded as 96 kbps mono MP3.

```sh
pip install -r tools/voices/requirements.txt     # numpy, pyloudnorm, pedalboard
python3 tools/sounds/make_sounds.py --sheet /tmp/sounds.png   # rebuild, and draw a spectrogram of each sound
```

Commons limits how fast one address may ask it for things, so the script waits six seconds between questions and as
long as Commons asks when it's busy. Answers and downloads are cached in `tools/sounds/.cache/`.

To swap a sound: find a recording on Commons (search with `filetype:audio`), put its `File:` title and the seconds
you want in `sources.json`, and run the script.
