#!/usr/bin/env python3
"""Builds the toy's real animal sounds from freely licensed recordings on Wikimedia Commons, into assets/sounds/.

    python3 tools/sounds/make_sounds.py            # download what's missing, rebuild every sound
    python3 tools/sounds/make_sounds.py --sheet x.png   # and draw a spectrogram of each sound, for checking by eye

sources.json says where each sound comes from:
  - a recording: the Commons file, the seconds to cut out, and optionally a gain or a speed change;
  - a designed sound (the dinosaurs, which nobody has recorded): layers of other recordings, slowed down and mixed,
    the way film sound designers make dinosaurs out of elephants, lions and alligators.

Every source file's license is read from Commons and must be public domain, CC0, CC BY or CC BY-SA, or the build stops.
Each sound is high-passed, trimmed, faded, brought to the toy's loudness, limited, and encoded as a mono MP3. The toy plays
on a phone's own speaker, which hardly plays anything below 300 Hz, so loudness is measured the way that speaker would play
it (PHONE_LUFS), and capped full-range (FULL_MAX) so headphones don't get a blast. Deep sounds (the lion, the dinosaurs)
use "shelf" and "presence" to move their weight up where a small speaker can play it. The script writes assets/sounds/sounds.json (sound name -> file, read by the page)
and assets/sounds/CREDITS.md (author, license, link and what was changed, for every recording used).
Downloads are cached in tools/sounds/.cache/ (git-ignored).
"""
import argparse, hashlib, html, json, os, re, subprocess, sys, time, urllib.parse
import numpy as np
import pyloudnorm as pyln
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, LowShelfFilter, PeakFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'sounds')
CACHE = os.path.join(HERE, '.cache')
SR = 44100
PHONE_LUFS = -24.0    # every animal call's loudness on a phone speaker (the page trims its synthesized calls to the same)
FULL_MAX = -19.0      # and never louder than this full-range, so a deep sound isn't a blast on headphones
UA = 'KidPhoneSoundBuilder/1.0 (https://github.com/DeltaSNull/KidPhone)'
OK_LICENSE = re.compile(r'^(public domain|pd\b.*|cc0.*|cc[ -]by(-sa)?[ -][0-9.]+.*)$', re.I)


def commons(**p):
    """one Commons API call: cached, six seconds apart, and waiting as long as Commons asks when it's busy"""
    p.update(format='json', formatversion='2')
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)
    f = os.path.join(CACHE, 'api-' + hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(f):
        return json.load(open(f))
    for attempt in range(8):
        time.sleep(6)
        r = subprocess.run(['curl', '-s', '-A', UA, '-D', '/dev/stderr', '-w', '\n%{http_code}', url], capture_output=True, text=True)
        body, code = r.stdout.rsplit('\n', 1)
        if code == '200':
            d = json.loads(body); json.dump(d, open(f, 'w')); return d
        ra = re.search(r'retry-after:\s*(\d+)', r.stderr, re.I)   # Commons says how long to wait
        time.sleep((int(ra.group(1)) if ra else 30) + 2)
    sys.exit('Commons API kept refusing: ' + url)


def strip(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', html.unescape(s or ''))).strip()


def file_info(title):
    d = commons(action='query', titles=title, prop='imageinfo', iiprop='url|extmetadata',
                iiextmetadatafilter='LicenseShortName|LicenseUrl|Artist|Credit')
    ii = d['query']['pages'][0]['imageinfo'][0]; em = ii['extmetadata']
    g = lambda k: strip(em.get(k, {}).get('value', ''))
    return dict(title=title, url=ii['url'], page='https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')),
                license=g('LicenseShortName'), license_url=g('LicenseUrl'), author=g('Artist') or g('Credit') or 'unknown')


def download(info):
    f = os.path.join(CACHE, hashlib.sha1(info['url'].encode()).hexdigest() + os.path.splitext(info['url'].split('?')[0])[1])
    if not os.path.exists(f):
        for attempt in range(8):
            time.sleep(3)
            r = subprocess.run(['curl', '-s', '-L', '-A', UA, '-D', '/dev/stderr', '-o', f + '.part', '-w', '%{http_code}', info['url']], capture_output=True, text=True)
            if r.stdout == '200':
                os.rename(f + '.part', f); break
            ra = re.search(r'retry-after:\s*(\d+)', r.stderr, re.I)
            time.sleep((int(ra.group(1)) if ra else 30) + 2)
        else:
            sys.exit('could not download ' + info['url'])
    return f


def decode(path, start=0.0, end=None, rate=1.0):
    """mono float at SR; rate < 1 slows it down and lowers it together, like slowing a tape"""
    flt = [f'atrim=start={start}' + (f':end={end}' if end else ''), 'asetpts=PTS-STARTPTS']
    if rate != 1:
        flt.append(f'aresample={SR},asetrate={SR * rate:.3f}')
    flt.append(f'aresample={SR}')
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-af', ','.join(flt), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype='<f4').astype(np.float32)   # astype copies, so the array can be changed


def speaker(a):
    """roughly what a phone's built-in speaker plays: falling away 18 dB an octave below about 350 Hz
    (-11 dB at 300 Hz, -18 dB at 200 Hz, -34 dB at 100 Hz, much like a measured iPhone speaker)"""
    return Pedalboard([HighpassFilter(cutoff_frequency_hz=350) for _ in range(3)])(a, SR)


def loudness(a):
    pad = np.concatenate([a, np.zeros(max(0, int(SR * .5) - len(a)), dtype=a.dtype)])
    return pyln.Meter(SR).integrated_loudness(pad.astype(np.float64))


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


def trim(a, floor_db=-45.0, head=.01, tail=.12):
    n = int(SR * .01)
    fr = np.sqrt(np.mean(a[:len(a) // n * n].reshape(-1, n) ** 2, axis=1) + 1e-12)
    on = np.nonzero(20 * np.log10(fr / fr.max()) > floor_db)[0]
    return a if not len(on) else a[max(0, on[0] * n - int(SR * head)):min(len(a), (on[-1] + 1) * n + int(SR * tail))]


def finish(a, spec):
    """hp, lp: filters (Hz). shelf: dB at 250 Hz and below. presence: dB around 1.1 kHz, where a phone speaker is loudest"""
    hp, lp = spec.get('hp', 70), spec.get('lp')   # each as two first-order stages (12 dB an octave): wind rumble goes, the call stays
    chain = [HighpassFilter(cutoff_frequency_hz=hp), HighpassFilter(cutoff_frequency_hz=hp)] + ([LowpassFilter(cutoff_frequency_hz=lp), LowpassFilter(cutoff_frequency_hz=lp)] if lp else [])
    if spec.get('shelf'):
        chain.append(LowShelfFilter(cutoff_frequency_hz=250, gain_db=spec['shelf']))
    if spec.get('presence'):
        chain.append(PeakFilter(cutoff_frequency_hz=1100, gain_db=spec['presence'], q=.7))
    a = trim(Pedalboard(chain)(a, SR))
    a = a * (10 ** (min(PHONE_LUFS - loudness(speaker(a)), FULL_MAX - loudness(a)) / 20))
    a = limit(a, SR, -1.0)
    n = len(a); fi, fo = min(n, int(SR * .006)), min(n, int(SR * .08))
    a[:fi] *= np.linspace(0, 1, fi); a[n - fo:] *= np.linspace(1, 0, fo)
    return a


def encode(a, path):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame',
                    '-b:a', '96k', path], input=a.astype('<f4').tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--sheet', help='write a spectrogram sheet of every sound to this PNG')
    ap.add_argument('--only', help='comma-separated sound names to rebuild')
    args = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    src = {k: v for k, v in json.load(open(os.path.join(HERE, 'sources.json'))).items() if not k.startswith('_')}
    infos, raw = {}, {}

    def cut(spec):
        """one recording, cut and optionally slowed"""
        t = spec['file']
        if t not in infos:
            infos[t] = file_info(t)
            if not OK_LICENSE.match(infos[t]['license']):
                sys.exit(f"{t}: license {infos[t]['license']!r} isn't public domain, CC0, CC BY or CC BY-SA")
            raw[t] = download(infos[t])
        a = decode(raw[t], spec.get('start', 0), spec.get('end'), spec.get('rate', 1))
        fi, fo = min(len(a), int(SR * .004)), min(len(a), int(SR * .02))   # a cut can land mid-wave: fade its edges so it can't click
        a[:fi] *= np.linspace(0, 1, fi); a[len(a) - fo:] *= np.linspace(1, 0, fo)
        return a * (10 ** (spec.get('gain', 0) / 20))

    made, used = {}, {}
    for name, spec in src.items():
        if args.only and name not in args.only.split(','):
            continue
        if 'layers' in spec:   # a designed sound: layers mixed at offsets
            parts = [(cut(src[l['from']] | {k: v for k, v in l.items() if k in ('rate', 'gain', 'start', 'end')} if 'from' in l else l), l.get('at', 0)) for l in spec['layers']]
            for l in spec['layers']:
                used.setdefault(src[l['from']]['file'] if 'from' in l else l['file'], set()).add(name)
            n = max(int(at * SR) + len(p) for p, at in parts); a = np.zeros(n, dtype=np.float32)
            for p, at in parts:
                i = int(at * SR); a[i:i + len(p)] += p
        else:
            a = cut(spec); used.setdefault(spec['file'], set()).add(name)
        a = finish(a, spec)
        encode(a, os.path.join(OUT, name + '.mp3'))
        made[name] = round(len(a) / SR, 2)
        print(f'  {name:9s} {made[name]:4.2f}s  phone {loudness(speaker(a)):5.1f}  full {loudness(a):5.1f} LUFS  {spec.get("note", "")}')

    if args.only:
        return
    json.dump({n: ({'file': n + '.mp3', 'then': src[n]['then']} if src[n].get('then') else n + '.mp3') for n in made},
              open(os.path.join(OUT, 'sounds.json'), 'w'), indent=1)   # "then": a synthesized sound the page plays right after
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:-4] not in made:
            os.remove(os.path.join(OUT, f))
    lines = ['# Credits for the animal sounds', '',
             'These recordings come from [Wikimedia Commons](https://commons.wikimedia.org/). Each was cut to a short call,',
             'filtered, faded and brought to the toy\'s loudness by `tools/sounds/make_sounds.py`; a few are sped up or slowed down,',
             'and the dinosaur sounds layer several of them. Files made from a CC BY-SA recording are shared under the same license.', '',
             '| Recording | Author | License | Used for |', '| --- | --- | --- | --- |']
    for t, names in sorted(used.items()):
        i = infos[t]; lic = f"[{i['license']}]({i['license_url']})" if i['license_url'] else i['license']
        lines.append(f"| [{t[5:]}]({i['page']}) | {i['author'].replace('|', '/')} | {lic} | {', '.join(sorted(names))} |")
    open(os.path.join(OUT, 'CREDITS.md'), 'w').write('\n'.join(lines) + '\n')
    print(f'{len(made)} sounds, {sum(os.path.getsize(os.path.join(OUT, n + ".mp3")) for n in made) / 1e3:.0f} KB')
    if args.sheet:
        tiles = []
        for n in made:
            png = os.path.join(CACHE, f'spec-{n}.png')
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(OUT, n + '.mp3'), '-lavfi',
                            f"showspectrumpic=s=420x130:legend=0:color=intensity:scale=log:fscale=lin:stop=11000,drawtext=text='{n}':fontcolor=white:fontsize=16:x=6:y=4", png], check=True)
            tiles.append(png)
        cols = 4; rows = (len(tiles) + cols - 1) // cols
        inputs = sum([['-i', t] for t in tiles], [])
        layout = '|'.join(f'{(i % cols) * 420}_{(i // cols) * 130}' for i in range(len(tiles)))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex',
                        f"{''.join(f'[{i}:v]' for i in range(len(tiles)))}xstack=inputs={len(tiles)}:layout={layout}:fill=black", args.sheet], check=True)
        print('sheet:', args.sheet)


if __name__ == '__main__':
    main()
