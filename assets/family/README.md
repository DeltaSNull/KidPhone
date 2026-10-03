# Family contacts

Family contacts show a real photo and play recorded voice clips instead of the speech voice.
They appear first in the Phone contacts, and they can also call in like the animals do.

**These are private family voices and faces.** Everything in this folder except this README and
`family.example.json` is ignored by git. Keep the files on your own server only. Don't put them on a
public host (GitHub Pages and so on) or in a claude.ai artifact.

## Add a contact

1. Record a few short clips in Voice Memos ("Hi buddy, it's Daddy!", "I love you!", "Bye bye!").
   Trim each one to a few seconds, then use Share → Save to Files. You get `.m4a` files, which Safari plays.
2. Pick a photo. A square crop about 400×400 px works best. Save it as `.jpg`.
3. Copy the files into this folder on the server (next to this README).
4. Copy `family.example.json` to `family.json` and edit it:

```json
{
  "contacts": [
    {
      "name": "Daddy",
      "photo": "daddy.jpg",
      "clips": ["daddy-hi.m4a", "daddy-love.m4a"],
      "bye": "daddy-bye.m4a",
      "color": "#BFE3F7"
    }
  ]
}
```

| Field | What it does |
| --- | --- |
| `name` | Shown under the photo (for parents) and used in "Daddy is calling you!" |
| `photo` | The picture on the contact and call screen |
| `clips` | The first clip plays when the call connects. The others play in random order every ~6 seconds |
| `bye` | Optional. Plays when the kid hangs up. Without it, the speech voice says "Bye bye!" |
| `color` | Optional. The background color behind the photo |
| `lines` | Optional. Spoken by the speech voice if a clip can't be played |

File names are relative to this folder. Full `https://` URLs and `data:` URIs work too.

5. Reload the page. Hold the clock for 3 seconds: the parent settings panel shows how many family contacts loaded.

## No server? Paste them into the page instead

In a private copy of `index.html`, fill in `FAMILY_INLINE` near the top of the script with the
same fields, using `data:` URIs (on a Mac: `base64 -i daddy-hi.m4a | pbcopy`, then prefix with
`data:audio/mp4;base64,`). Don't publish that copy anywhere public.
