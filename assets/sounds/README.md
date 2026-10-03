# Real animal recordings

The recordings here come from Wikimedia Commons and are built by `tools/sounds/make_sounds.py` (credits in
[CREDITS.md](CREDITS.md)). A recording plays everywhere its sound is used: phone calls, the home screen, Wild Tap,
the camera and the games. Anything without a recording uses its synthesized call. You can add your own too.

A great source: record the real animals on your next zoo trip with Voice Memos.

## Add a recording

1. Trim each recording to a short, clean call (1–3 seconds). `.m4a` from Voice Memos, `.mp3` and `.wav` all work.
2. Put the files in this folder on the server.
3. Add them to `sounds.json` (it already lists the built recordings; `sounds.example.json` shows the format), by
   animal or by sound. An entry can also name a synthesized sound to play right after it, like
   `"stego": {"file": "stego.mp3", "then": "stomp"}`. Running `make_sounds.py` again rewrites `sounds.json`, so add
   your lines back after a rebuild. Your files play as they are, so trim them to a similar loudness first:

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

Everything here is committed to git and published with the site. The recordings `make_sounds.py` builds are all
freely licensed. Recordings you find elsewhere often come with a license that doesn't allow sharing them again:
keep those on your own server (don't commit them), and check the license before putting anything public.
