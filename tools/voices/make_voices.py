#!/usr/bin/env python3
"""Records every line the toy says, with Kokoro (a neural text-to-speech model), into assets/voice/.

    python3 tools/voices/make_voices.py --model kokoro.onnx --voices voices.npz          # record what's new
    python3 tools/voices/make_voices.py --model kokoro.onnx --voices voices.npz --check  # and check every clip

The lines come from index.html itself (tools/voices/lines.cjs asks the page for them), so a line added to the toy is
picked up the next time this runs. Who says what is in speakers.json: a narrator, and a character voice for each
animal on the phone. Each line becomes one small mono MP3, named by a hash of who says it, the words and that
speaker's settings, so running it again only records what changed and deletes clips nothing uses any more.
assets/voice/voice.json maps "who|line" to [file, milliseconds] for the page.

Every clip is filtered below 80 Hz, voiced for a phone's own speaker (a little less below 200 Hz, a little more
presence around 3 kHz), brought to the same loudness as that speaker would play it (it hardly plays anything below
300 Hz, and some voices have more down there than others), limited, and trimmed of quiet ends, so the narrator and the
animals sit at one level on the phone and lines follow each other without dead air. --check transcribes each clip with pocketsphinx (an
offline speech recognizer) and lists the clips whose words come back furthest from the script, worst first.
See tools/voices/README.md for where the model and voices come from.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, time
import numpy as np
import pyloudnorm as pyln
from pedalboard import Pedalboard, PitchShift, HighpassFilter, LowShelfFilter, PeakFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'voice')
SR = 24000
PHONE_LUFS = -21.0      # every clip's loudness on a phone speaker (the page plays it 3 dB over the animal calls)
FULL_MAX = -17.0        # and never louder than this full-range
BITRATE = '40k'
VERSION = 4             # bump to re-record everything after changing the processing below

# Words the model says wrong ("Grr" comes out letter by letter), respelled for it only; the page keeps the real words.
RESPELL = [(r'\bgrr+\b', 'Gurr'), (r'\bbrr+\b', 'Burr'), (r'\bla la la\b', 'Lah lah lah'), (r'\bpawoo\b', 'Pah-woo'), (r'\b123\b', 'One, two, three')]


# A letter on its own ("Find the B!", "That's b!", "B is for bear!") is said as its name. Respelling doesn't work (the
# speech front end reads "Ay" as "eye" and spells "Eff" out), and a bare "A is for" comes out as the word "a", so the
# letter's name goes in as phonemes, spliced between the rest of the line.
LONE_LETTER = re.compile(r"\b([A-Za-z])(?=[!?.,]| is | says)")
LETTER_IPA = dict(A='ˈeɪ', B='bˈiː', C='sˈiː', D='dˈiː', E='ˈiː', F='ˈɛf', G='dʒˈiː', H='ˈeɪtʃ', I='ˈaɪ', J='dʒˈeɪ', K='kˈeɪ', L='ˈɛl', M='ˈɛm',
                  N='ˈɛn', O='ˈoʊ', P='pˈiː', Q='kjˈuː', R='ˈɑːɹ', S='ˈɛs', T='tˈiː', U='jˈuː', V='vˈiː', W='dˈʌbəljˌuː', X='ˈɛks', Y='wˈaɪ', Z='zˈiː')


def tts_text(t):
    for a, b in RESPELL:
        t = re.sub(a, b, t, flags=re.I)
    return t


def phonemes(k, text):
    """the line as phonemes, with each lone letter's name put in exactly"""
    ph = lambda t: k.tokenizer.phonemize(t, 'en-us')
    out, pos = [], 0
    for m in LONE_LETTER.finditer(text):
        if text[pos:m.start()].strip():
            out.append(ph(text[pos:m.start()]))
        name = LETTER_IPA[m.group(1).upper()]
        if out and out[-1].endswith('ðə') and name.lstrip('ˈ')[0] in 'eɛaoɑi':
            out[-1] = out[-1][:-2] + 'ðɪ'   # "the" before a vowel sound: "thee A", "thee F"
        out.append(name)
        pos = m.end()
    rest = text[pos:].lstrip()
    if rest[:1] in ('!', '?', '.', ','):
        if out:
            out[-1] += rest[0]   # the punctuation after a letter stays with it
        rest = rest[1:]
    if rest.strip():
        out.append(ph(rest))
    return ' '.join(out)


def voices_npz(path):
    """kokoro-onnx wants one .npz; the kokoro-js npm package ships one float32 .bin per voice (510 x 256)"""
    if not os.path.isdir(path):
        return path
    out = os.path.join(tempfile.gettempdir(), 'kokoro-voices.npz')
    np.savez(out, **{f[:-4]: np.fromfile(os.path.join(path, f), dtype=np.float32).reshape(-1, 1, 256)
                     for f in sorted(os.listdir(path)) if f.endswith('.bin')})
    return out


def clip_name(who, text, spk):
    key = f"{VERSION}|{who}|{text}|{spk['voice']}|{spk['speed']}|{spk['semis']}" + ('|letters2' if LONE_LETTER.search(text) else '') + (f'|sounds{SOUNDS_VERSION}' if SOUND_TOKEN.search(text) else '') + ('|lone1' if LONE.match(text) else '')   # (a new name for re-recorded letter lines and changed sounds, so no phone keeps an old copy)
    return hashlib.sha1(key.encode()).hexdigest()[:12] + '.mp3'


def page_lines():
    out = subprocess.run(['node', os.path.join(HERE, 'lines.cjs')], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def speaker(a):
    """roughly what a phone's built-in speaker plays: falling away 18 dB an octave below about 350 Hz"""
    return Pedalboard([HighpassFilter(cutoff_frequency_hz=350) for _ in range(3)])(a, SR)


def loudness(a):
    meter = pyln.Meter(SR)
    pad = np.concatenate([a, np.zeros(max(0, int(SR * .5) - len(a)), dtype=a.dtype)])   # the meter needs 0.4 s
    return meter.integrated_loudness(pad.astype(np.float64))


def limit(a, sr, ceiling_db=-1.0, look=.002, release=.06):
    """A peak limiter that only ever turns loud peaks down to the ceiling (pedalboard's Limiter also adds makeup gain,
    which made everything about 4 dB louder than its loudness target)."""
    from numpy.lib.stride_tricks import sliding_window_view
    c = 10 ** (ceiling_db / 20)
    if np.abs(a).max() <= c:
        return a
    need = np.minimum(1.0, c / np.maximum(np.abs(a), 1e-9))
    w = max(1, int(sr * look))
    g = sliding_window_view(np.pad(need, (w, w), mode='edge'), 2 * w + 1).min(axis=1)   # starts turning down just before a peak
    k, v, out = np.exp(-1 / (sr * release)), 1.0, np.empty_like(g)
    for i, gi in enumerate(g):   # instant attack, smooth release
        v = gi if gi < v else gi + (v - gi) * k
        out[i] = v
    return (a * out).astype(np.float32)


def trim(a, floor_db=-40.0, head=.02, tail=.08):
    """Cut the quiet ends: some voices leave half a second of breath after a line, which would hold up the next one."""
    n = int(SR * .01)
    fr = np.sqrt(np.mean(a[:len(a) // n * n].reshape(-1, n) ** 2, axis=1) + 1e-12)
    on = np.nonzero(20 * np.log10(fr / fr.max()) > floor_db)[0]
    if not len(on):
        return a
    return a[max(0, on[0] * n - int(SR * head)):min(len(a), (on[-1] + 1) * n + int(SR * tail))]


# Letter sounds for phonics ("sss", the a in apple), written /s/ in a line. The model can't say a sound on its own, so each
# is cut from a word that starts with it: the narrator says the word, pocketsphinx lines its phones up with the audio,
# and the sound is cut out. Short vowels are the steady middle of an h-word (hat, head, hit, hot, hut: nothing before
# the vowel to color it), stretched to a third of a second. l, n and m are the steady part of the sound in a word,
# stretched to half a second; r, v and z come out best said held (the phoneme written four times). The voiceless ones
# (s, f, t, p, c, k, h, and the ks of x) keep only the frames with little energy below 1 kHz, from the closure before a
# burst, so no vowel follows them; s and f are stretched to half a second, h to a quarter. b, d, g, j, w, y and q keep a
# breath of the vowel after them ("buh", from but), or they can't be heard. x is the end of "box" (ks), q the start of
# "queen" (kw). Each sound is then brought to a set loudness against the narrator's speech: a quiet puff of p or k would
# be lost on a phone speaker. These choices were made by a blend test (tools/voices/README.md): the sound spliced onto
# the rest of a word (/s/ + "et") must be heard as that word. Raise SOUNDS_VERSION when a sound changes.
SOUNDS_VERSION = 2
SOUND_SRC = {'s':('sun','S','fric'), 'a':('hat','AE','steady'), 't':('top','T','stop'), 'i':('hit','IH','steady'), 'p':('pop','P','stop'),
             'n':('nap','N','steady'), 'c':('cat','K','stop'), 'k':('kit','K','stop'), 'e':('head','EH','steady'), 'h':('hat','HH','breath'),
             'r':('red','R','hold'), 'm':('hum','M','steady'), 'd':('duck','D','vstop'), 'g':('gum','G','vstop'), 'o':('hot','AA','steady'),
             'u':('hut','AH','steady'), 'l':('lap','L','steady'), 'f':('fan','F','fric'), 'b':('but','B','vstop'), 'j':('jam','JH','vstop'),
             'z':('zip','Z','hold'), 'w':('wet','W','glide'), 'v':('van','V','hold'), 'y':('yes','Y','glide'), 'x':('box','K S','end'), 'q':('queen','K W','glide')}
VOWELS = 'aeiou'
# loudest 30 ms of each sound against the loudest moments of the narrator's speech, in dB (the voiceless ones a little
# softer than the voice, as they are in speech, but clearly there)
SOUND_LEVEL = {'fric': -4, 'stop': -3, 'breath': -5, 'end': -4, 'steady': -1.5, 'hold': -1.5, 'vstop': -1.5, 'glide': -1.5}
SOUND_TOKEN = re.compile(r'/([a-z])/')
_sounds, _aligner = {}, []


def align(a, word):
    """the word's phones and where they are, in seconds (pocketsphinx forced alignment, two passes)"""
    from pocketsphinx import Decoder, get_model_path
    from scipy.signal import resample_poly
    if not _aligner:
        m = get_model_path()
        _aligner.append(Decoder(hmm=os.path.join(m, 'en-us', 'en-us'), dict=os.path.join(m, 'en-us', 'cmudict-en-us.dict'), loglevel='FATAL'))
    d = _aligner[0]
    pad = np.concatenate([np.zeros(int(SR * .2)), a, np.zeros(int(SR * .2))])
    pcm = (resample_poly(pad, 2, 3) * 32767).clip(-32768, 32767).astype('<i2').tobytes()
    d.set_align_text(word); d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
    d.set_alignment(); d.start_utt(); d.process_raw(pcm, full_utt=True); d.end_utt()
    return [(p.name, p.start * .01 - .2, (p.start + p.duration) * .01 - .2) for w in d.get_alignment() for p in w if p.name != 'SIL']


def letter_sound(k, key):
    if key in _sounds:
        return _sounds[key]
    from pedalboard import time_stretch
    word, phones, kind = SOUND_SRC[key]
    unvoiced, slow = kind in ('fric', 'stop', 'breath'), kind in ('hold', 'vowel')
    if kind == 'steady':
        a, sr = k.create(k.tokenizer.phonemize(word, 'en-us'), voice='af_heart', speed=1, is_phonemes=True); a = a.astype(np.float32)
        al = align(a, word); hit = [p for p in al if p[0] == phones]
        if not hit:
            sys.exit(f'letter sound {key}: no {phones} in "{word}", the aligner heard {al}')
        _, t0, t1 = hit[0]; d = t1 - t0
        s = a[int((t0 + d*.2)*SR):int((t1 - d*.2)*SR)].copy()   # the steady middle, without the glides in and out
        s = time_stretch(s[None, :], SR, stretch_factor=len(s) / (SR * (.35 if key in VOWELS else .5)))[0].astype(np.float32)
        return _level(k, key, kind, s)
    ph = k.tokenizer.phonemize(word + ('.' if slow else ''), 'en-us')
    if kind in ('hold', 'vowel'):   # say the sound held: its phoneme written again (four times for a consonant, twice for a vowel)
        i = next(j for j, ch in enumerate(ph) if ch not in 'ˈˌ')
        ph = ph[:i] + ph[i] * (4 if kind == 'hold' else 2) + ph[i + 1:]
    # slowed down, the model starts a word with a voiced murmur, an "uh" before the consonant: only the held sounds and vowels are said slowly
    a, sr = k.create(ph, voice='af_heart', speed=.8 if slow else 1, is_phonemes=True)
    a = a.astype(np.float32)
    al, want = align(a, word), phones.split()
    seg = al[len(al) - len(want):] if kind == 'end' else al[:len(want)]
    if [p[0] for p in seg] != want:
        sys.exit(f'letter sound {key}: expected {want} at the {"end" if kind == "end" else "start"} of "{word}", the aligner heard {al}')
    t0, t1 = seg[0][1], seg[-1][2]
    t1 += {'vstop': .035, 'glide': .03, 'vowel': -.015}.get(kind, 0)
    if kind == 'end':
        t1 = len(a) / SR
    if unvoiced or kind == 'end':   # keep just the voiceless part: the frames with little of their energy below 1 kHz, up to where the vowel comes in
        n = int(SR * .01); fr = [a[i:i + n] for i in range(0, min(len(a) - n, int((t1 + .06) * SR)), n)]
        e = [float((f ** 2).sum()) + 1e-12 for f in fr]; peak = max(e)
        lo = lambda f: (lambda X, hz: X[(hz > 80) & (hz < 1000)].sum() / (X.sum() + 1e-12))(np.abs(np.fft.rfft(f * np.hanning(len(f)))) ** 2, np.fft.rfftfreq(len(f), 1 / SR))
        quiet = [e[j] > peak * .003 and lo(f) < .5 for j, f in enumerate(fr)]
        runs, j = [], 0
        while j < len(fr):   # runs of voiceless frames, a single other frame inside one allowed
            if quiet[j]:
                b = j
                while j + 1 < len(fr) and (quiet[j + 1] or (j + 2 < len(fr) and quiet[j + 2])):
                    j += 1 + (not quiet[j + 1])
                runs.append((b, j + 1))
            j += 1
        if not runs:
            sys.exit(f'letter sound {key}: no voiceless part found in "{word}"')
        b, end = max(runs, key=lambda r: r[1] - r[0])
        if kind in ('stop', 'end'):   # from the quietest frame just before: the closure, so the burst is whole
            b = min(range(max(0, b - 3), b + 1), key=lambda j: e[j])
        t0, t1 = b * .01, end * .01
    s = a[max(0, int(t0 * SR)):int(t1 * SR)].copy()
    target = {'hold': .5, 'fric': .5, 'breath': .25, 'vowel': .3}.get(kind)
    if target and len(s) > SR * .03:
        s = time_stretch(s[None, :], SR, stretch_factor=len(s) / (SR * target))[0].astype(np.float32)
    return _level(k, key, kind, s)


def _peak30(a):
    n = int(SR * .03)
    return max(float(np.sqrt((a[i:i + n] ** 2).mean())) for i in range(0, max(1, len(a) - n), n // 2)) + 1e-9


_speech_ref = []
def _level(k, key, kind, s):
    """fades, then the sound brought to its loudness against the narrator's voice"""
    n = len(s); fi, fo = min(n, int(SR * (.003 if kind in ('stop', 'end') else .008))), min(n, int(SR * (.02 if kind == 'stop' else .04)))
    s[:fi] *= np.linspace(0, 1, fi); s[n - fo:] *= np.linspace(1, 0, fo)
    if not _speech_ref:   # the loudest moments of the narrator saying a phrase
        a, _ = k.create(k.tokenizer.phonemize('It says this, like that.', 'en-us'), voice='af_heart', speed=.93, is_phonemes=True); a = a.astype(np.float32)
        w = int(SR * .03); wins = sorted(float(np.sqrt((a[i:i + w] ** 2).mean())) for i in range(0, len(a) - w, w // 2))
        _speech_ref.append(float(np.median(wins[-10:])))
    s = s * (_speech_ref[0] * 10 ** (SOUND_LEVEL[kind] / 20) / _peak30(s))
    _sounds[key] = s.astype(np.float32)
    return _sounds[key]


LONE = re.compile(r'^[A-Za-z][!.?]$')   # a letter said on its own ("T!"): slowed down, T's puff turned into a hiss like C's


def speak(k, text, spk):
    """the words through the model; /s/ tokens as the letter sounds, with a short pause either side"""
    parts, pos, out = [], 0, []
    for m in SOUND_TOKEN.finditer(text):
        parts += [('t', text[pos:m.start()]), ('s', m.group(1))]; pos = m.end()
    parts.append(('t', text[pos:]))
    gap = np.zeros(int(SR * .12), dtype=np.float32)
    for kind, v in parts:
        if kind == 's':
            out += [gap, letter_sound(k, v), gap]
        elif re.search(r'[A-Za-z0-9]', v):
            a, sr = k.create(phonemes(k, tts_text(v.lstrip(' ,.!?').strip())), voice=spk['voice'], speed=max(spk['speed'], 1) if LONE.match(text) else spk['speed'], is_phonemes=True, sentence_pause=.28, clause_pause=.12)
            assert sr == SR
            out.append(a.astype(np.float32))
    return np.concatenate(out) if out else np.zeros(1, dtype=np.float32)


def render(k, text, spk):
    phon = text if SOUND_TOKEN.search(text) else phonemes(k, tts_text(text))
    a = speak(k, text, spk)
    chain = [HighpassFilter(cutoff_frequency_hz=80), LowShelfFilter(cutoff_frequency_hz=200, gain_db=-6), PeakFilter(cutoff_frequency_hz=3000, gain_db=2.5, q=.8)]
    if spk['semis']:
        chain.insert(0, PitchShift(semitones=spk['semis']))
    a = Pedalboard(chain)(a, SR)
    a = a * (10 ** (min(PHONE_LUFS - loudness(speaker(a)), FULL_MAX - loudness(a)) / 20))
    a = limit(a, SR, -1.5)
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
        if SOUND_TOKEN.search(text):
            continue   # (a letter sound isn't a word the recognizer could score)
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
