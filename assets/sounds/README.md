# Real animal recordings (optional)

Out of the box, every animal's voice is synthesized in the browser. If you have real recordings, drop them in
here and the real thing plays instead, everywhere that sound is used: phone calls, the home screen, Wild Tap, the
camera and the games.

A great source: record the real animals on your next zoo trip with Voice Memos.

## Add a recording

1. Trim each recording to a short, clean call (1–3 seconds). `.m4a` from Voice Memos, `.mp3` and `.wav` all work.
2. Put the files in this folder on the server.
3. Copy `sounds.example.json` to `sounds.json` and list the files, by animal or by sound:

```json
{
  "lion": "lion-roar.m4a",
  "elephant": "elephant.mp3",
  "growl": "tiger-growl.mp3"
}
```

By animal: `lion`, `elephant`, `giraffe`, `zebra`, `monkey`, `penguin`, `hippo`, `trex`, `longneck`, `trike`,
`stego`, `ptero` (the animals on the phone; each one's recording also plays wherever its sound is used).
By sound: `roar`, `bigroar`, `trumpet`, `munch`, `neigh`, `ooh`, `bray`, `hippo`, `bellow`, `huff`, `stego`,
`screech`, `snort`, `growl`, `squawk`, `honk`, `thump`, `ribbit`, `hoot`, `yawn`, `moo`, `woof`, `meow`, `quack`,
`tweet`, `peep`, `snap`, `splash`. Anything not listed keeps its synthesized version.

4. Reload the page.

## Licenses

Everything here except this README and the example is ignored by git. Recordings you download often come with a
license that doesn't allow sharing them again. Keep them on your own server, and check the license before
putting them anywhere public.
