# Real animal recordings (optional)

Out of the box, every animal's voice is synthesized in the browser. If you have real recordings, drop them in
here and that animal plays the real thing instead. Recordings work on Phone calls (when the animal picks up, and
when the kid pokes its picture mid-call) and for the animals on the home screen.

A great source: record the real animals on your next zoo trip with Voice Memos.

## Add a recording

1. Trim each recording to a short, clean call (1–3 seconds). `.m4a` from Voice Memos, `.mp3` and `.wav` all work.
2. Put the files in this folder on the server.
3. Copy `sounds.example.json` to `sounds.json` and list the files by animal:

```json
{
  "lion": "lion-roar.m4a",
  "elephant": "elephant.mp3"
}
```

Animal names: `lion`, `elephant`, `giraffe`, `zebra`, `monkey`, `penguin`, `hippo`, `trex`, `longneck`, `trike`,
`stego`, `ptero`. Any animal not listed keeps its synthesized voice.

4. Reload the page.

## Licenses

Everything here except this README and the example is ignored by git. Recordings you download often come with a
license that doesn't allow sharing them again. Keep them on your own server, and check the license before
putting them anywhere public.
