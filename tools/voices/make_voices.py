#!/usr/bin/env python3
"""Records every line the toy says, with Kokoro (a neural text-to-speech model), into assets/voice/.

    python3 tools/voices/make_voices.py --model kokoro.onnx --voices voices.npz          # record what's new
    python3 tools/voices/make_voices.py --model kokoro.onnx --voices voices.npz --check  # and check every clip

The lines come from index.html itself (tools/voices/lines.cjs asks the page for them), so a line added to the toy is
picked up the next time this runs. Who says what is in speakers.json: a narrator, and a character voice for each
animal on the phone. Each line becomes one small mono MP3, named by a hash of who says it, the words and that
speaker's settings, so running it again only records what changed and deletes clips nothing uses any more.
assets/voice/voice.json maps "who|line" to [file, milliseconds] for the page.

Every clip is filtered below 80 Hz, brought to the same loudness, limited, and trimmed of quiet ends, so the narrator
and the animals sit at one level and lines follow each other without dead air. --check transcribes each clip with pocketsphinx (an
offline speech recognizer) and lists the clips whose words come back furthest from the script, worst first.
See tools/voices/README.md for where the model and voices come from.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, time
import numpy as np
import pyloudnorm as pyln
from pedalboard import Pedalboard, PitchShift, HighpassFilter, Limiter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'voice')
SR = 24000
LUFS = -16.0            # every clip's loudness
BITRATE = '40k'
VERSION = 2             # bump to re-record everything after changing the processing below

# Words the model says wrong ("Grr" comes out letter by letter), respelled for it only; the page keeps the real words.
RESPELL = [(r'\bgrr+\b', 'Gurr'), (r'\bbrr+\b', 'Burr'), (r'\bla la la\b', 'Lah lah lah'), (r'\bpawoo\b', 'Pah-woo')]


def tts_text(t):
    for a, b in RESPELL:
        t = re.sub(a, b, t, flags=re.I)
    return t


def voices_npz(path):
    """kokoro-onnx wants one .npz; the kokoro-js npm package ships one float32 .bin per voice (510 x 256)"""
    if not os.path.isdir(path):
        return path
    out = os.path.join(tempfile.gettempdir(), 'kokoro-voices.npz')
    np.savez(out, **{f[:-4]: np.fromfile(os.path.join(path, f), dtype=np.float32).reshape(-1, 1, 256)
                     for f in sorted(os.listdir(path)) if f.endswith('.bin')})
    return out


def clip_name(who, text, spk):
    key = f"{VERSION}|{who}|{text}|{spk['voice']}|{spk['speed']}|{spk['semis']}"
    return hashlib.sha1(key.encode()).hexdigest()[:12] + '.mp3'


def page_lines():
    out = subprocess.run(['node', os.path.join(HERE, 'lines.cjs')], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def loudness(a):
    meter = pyln.Meter(SR)
    pad = np.concatenate([a, np.zeros(max(0, int(SR * .5) - len(a)), dtype=a.dtype)])   # the meter needs 0.4 s
    return meter.integrated_loudness(pad.astype(np.float64))


def trim(a, floor_db=-40.0, head=.02, tail=.08):
    """Cut the quiet ends: some voices leave half a second of breath after a line, which would hold up the next one."""
    n = int(SR * .01)
    fr = np.sqrt(np.mean(a[:len(a) // n * n].reshape(-1, n) ** 2, axis=1) + 1e-12)
    on = np.nonzero(20 * np.log10(fr / fr.max()) > floor_db)[0]
    if not len(on):
        return a
    return a[max(0, on[0] * n - int(SR * head)):min(len(a), (on[-1] + 1) * n + int(SR * tail))]


def render(k, text, spk):
    phon = k.tokenizer.phonemize(tts_text(text), 'en-us')
    a, sr = k.create(phon, voice=spk['voice'], speed=spk['speed'], is_phonemes=True, sentence_pause=.28, clause_pause=.12)
    assert sr == SR
    a = a.astype(np.float32)
    chain = [HighpassFilter(cutoff_frequency_hz=80)]
    if spk['semis']:
        chain.insert(0, PitchShift(semitones=spk['semis']))
    a = Pedalboard(chain)(a, SR)
    a = a * (10 ** ((LUFS - loudness(a)) / 20))
    a = Pedalboard([Limiter(threshold_db=-1.5, release_ms=60)])(a, SR)
    a = trim(a)
    n = len(a); fi, fo = min(n, int(SR * .008)), min(n, int(SR * .03))
    a[:fi] *= np.linspace(0, 1, fi); a[n - fo:] *= np.linspace(1, 0, fo)
    return a, phon


def encode(a, path):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-ar', str(SR), path], input=a.astype('<f4').tobytes(), check=True)


def words(t):
    t = t.lower().replace("'", '').replace('-', ' ')
    return re.sub(r'[^a-z ]+', ' ', t).split()


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def check(manifest):
    """Transcribe every clip as shipped (MP3 decoded at 16 kHz) and score it against its script."""
    from pocketsphinx import Decoder
    rows = []
    for key, (f, ms) in manifest.items():
        who, text = key.split('|', 1)
        pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(OUT, f), '-f', 's16le', '-ar', '16000', '-ac', '1', '-'],
                             capture_output=True, check=True).stdout
        d = Decoder(samprate=16000); d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
        hyp = d.hyp().hypstr if d.hyp() else ''
        rows.append((wer(text, hyp), who, text, hyp, ms))
    rows.sort(reverse=True)
    by = {}
    for w, who, *_ in rows:
        by.setdefault(who, []).append(w)
    print('\nword error rate by speaker (pocketsphinx is a rough listener: compare speakers and look at the outliers)')
    for who, ws in sorted(by.items(), key=lambda x: -np.mean(x[1])):
        print(f'  {who:9s} {np.mean(ws):.2f}  ({len(ws)} clips)')
    print('\nfurthest from the script:')
    for w, who, text, hyp, ms in rows[:30]:
        print(f'  {w:.2f} {who:9s} {text!r} -> {hyp!r}')
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--model', required=True, help='Kokoro ONNX model (kokoro-v1.0 fp32)')
    ap.add_argument('--voices', required=True, help='the voices: a folder of Kokoro .bin voice files (as in the kokoro-js npm package), or an .npz')
    ap.add_argument('--lines', help='lines JSON (default: ask index.html)')
    ap.add_argument('--check', action='store_true', help='transcribe every clip and list the worst')
    ap.add_argument('--report', help='write the check results to this JSON file')
    args = ap.parse_args()

    spk = {k: v for k, v in json.load(open(os.path.join(HERE, 'speakers.json'))).items() if not k.startswith('_')}
    lines = json.load(open(args.lines)) if args.lines else page_lines()
    os.makedirs(OUT, exist_ok=True)
    manifest, todo = {}, []
    for ln in lines:
        who, text = ln['who'], ln['s']
        if who not in spk:
            sys.exit(f'speakers.json has no speaker {who!r}')
        f = clip_name(who, text, spk[who])
        manifest[f'{who}|{text}'] = f
        if not os.path.exists(os.path.join(OUT, f)):
            todo.append((who, text, f))

    old = json.load(open(os.path.join(OUT, 'voice.json'))) if os.path.exists(os.path.join(OUT, 'voice.json')) else {'clips': {}}
    ms = {v[0]: v[1] for v in old.get('clips', {}).values()}
    print(f'{len(manifest)} lines, {len(todo)} to record')
    if todo:
        from kokoro_onnx import Kokoro
        k = Kokoro(args.model, voices_npz(args.voices))
        t0 = time.time()
        for i, (who, text, f) in enumerate(todo, 1):
            a, phon = render(k, text, spk[who])
            encode(a, os.path.join(OUT, f))
            ms[f] = round(len(a) / SR * 1000)
            if i % 25 == 0 or i == len(todo):
                print(f'  {i}/{len(todo)}  {time.time() - t0:.0f}s  {who}: {text}')
    used = set(manifest.values())
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f not in used:
            os.remove(os.path.join(OUT, f))
    out = {'v': VERSION, 'speakers': {k: v['name'] for k, v in spk.items()},
           'clips': {key: [f, ms[f]] for key, f in sorted(manifest.items())}}
    with open(os.path.join(OUT, 'voice.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'), ensure_ascii=False)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in used)
    print(f'assets/voice: {len(used)} clips, {size / 1e6:.1f} MB, {sum(v[1] for v in out["clips"].values()) / 60000:.1f} minutes')
    if args.check:
        rows = check(out['clips'])
        if args.report:
            json.dump([dict(zip(['wer', 'who', 'text', 'heard', 'ms'], r)) for r in rows], open(args.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
