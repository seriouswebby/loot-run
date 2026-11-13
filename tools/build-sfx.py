#!/usr/bin/env python3
"""Build js/sfxdata.js (recorded sound effects, base64 MP3) and CREDITS.md from tools/sfx-manifest.json.

Every sound is a CC0 (public domain) recording from freesound.org. The script downloads each sound's
HQ preview into .sfx-cache/, confirms the CC0 license on the sound's own page, trims and normalises it
with ffmpeg, makes loops seamless, and embeds the result in a script file (so the game still runs
from file:// where fetch() of local files is blocked).

Manifest entry fields:
  id      Freesound sound id (required)
  start   seconds into the recording, or "auto" = first transient (default "auto")
  dur     seconds to keep (default: to the end)
  gain    extra gain in dB after peak normalisation to -1 dBFS (default 0)
  fade    one-shots: fraction of the clip faded out at the end (default 0.35)
  loop    true = seamless loop (tail crossfaded into head)
  xfade   loop crossfade length in seconds (default 0.25)
  hp, lp  optional highpass / lowpass cutoff in Hz
  rate    optional resample factor baked in (e.g. 1.2 = 20% higher pitch, shorter)
  kbps    MP3 bitrate (default 80; noisy ambiences are fine at 48)

usage: python3 tools/build-sfx.py [key ...]   (keys = rebuild only these; others reuse the cache)
"""
import array, base64, json, math, os, re, subprocess, sys, urllib.request, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.sfx-cache')
SR = 44100
PAD = 0.1  # circular padding around loops, so decoder delay never lands on the seam
UA = {'User-Agent': 'Mozilla/5.0 (loot-run sfx build)'}
CC0 = 'creativecommons.org/publicdomain/zero/1.0/'


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    req = urllib.request.Request(url, headers=UA)
    data = urllib.request.urlopen(req, timeout=60).read()
    with open(path, 'wb') as f:
        f.write(data)


def sound_info(sid):
    page = os.path.join(CACHE, f'{sid}.html')
    fetch(f'https://freesound.org/s/{sid}/', page)
    html = open(page, encoding='utf8', errors='replace').read()
    lic = re.search(r'title="Go to the full license text" href="([^"]+)"', html)
    if not lic or CC0 not in lic.group(1):
        raise SystemExit(f'sound {sid}: license is not CC0 ({lic.group(1) if lic else "not found"})')
    t = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    title, _, user = (t.group(1) if t else f'sound {sid}').rpartition(' by ')
    m = re.search(r'https://cdn\.freesound\.org/previews/\d+/%d_\d+-(?:hq|lq)\.mp3' % sid, html)
    if not m:
        raise SystemExit(f'sound {sid}: no preview link found')
    import html as H
    return {'title': H.unescape(title), 'user': H.unescape(user), 'url': m.group(0).replace('-lq.mp3', '-hq.mp3')}


def decode(path, e):
    """mono 16-bit samples at SR, after optional filters"""
    filt = []
    if e.get('hp'): filt.append(f"highpass=f={e['hp']}")
    if e.get('lp'): filt.append(f"lowpass=f={e['lp']}")
    if e.get('rate'): filt.append(f"asetrate={int(SR * e['rate'])},aresample={SR}")
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR)]
    if filt: cmd += ['-af', ','.join(filt)]
    cmd += ['-f', 's16le', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = array.array('h'); a.frombytes(raw)
    return [v / 32768.0 for v in a]


def process(s, e):
    peak = max(abs(v) for v in s) or 1.0
    st = e.get('start', 'auto')
    if st == 'auto':
        i0 = next(i for i, v in enumerate(s) if abs(v) > peak * 0.12)
        i0 = max(0, i0 - int(0.004 * SR))
    else:
        i0 = int(st * SR)
    n = int(e['dur'] * SR) if e.get('dur') else len(s) - i0
    if e.get('loop'):
        x = int(e.get('xfade', 0.25) * SR)
        if i0 + n + x > len(s):
            n = len(s) - i0 - x
        seg = s[i0:i0 + n + x]
        out = seg[:n]
        for i in range(x):  # equal-power: the stretch past the loop end fades into the head
            w = math.sin(0.5 * math.pi * i / x)
            out[i] = seg[i] * w + seg[n + i] * math.cos(0.5 * math.pi * i / x)
        p = int(PAD * SR)
        out = out[n - p:] + out + out[:p]
        loop = [PAD, PAD + n / SR]
    else:
        out = s[i0:i0 + n]
        f = int(len(out) * e.get('fade', 0.35))
        for i in range(f):
            k = 1 - i / f
            out[len(out) - f + i] *= k * k
        for i in range(min(len(out), int(0.002 * SR))):
            out[i] *= i / (0.002 * SR)
        loop = None
    peak = max(abs(v) for v in out) or 1.0
    g = 10 ** (-1 / 20) / peak * 10 ** (e.get('gain', 0) / 20)
    return [max(-1.0, min(1.0, v * g)) for v in out], loop


def encode(samples, path, kbps=80):
    wav = path + '.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(array.array('h', (int(v * 32767) for v in samples)).tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ac', '1', path], check=True)
    os.remove(wav)


def main():
    os.makedirs(CACHE, exist_ok=True)
    man = json.load(open(os.path.join(ROOT, 'tools', 'sfx-manifest.json')))
    only = set(sys.argv[1:])
    data, credits, total = {}, [], 0
    for key, e in man.items():
        if key.startswith('_'):
            continue
        info = sound_info(e['id'])
        raw = os.path.join(CACHE, f"{e['id']}.mp3")
        fetch(info['url'], raw)
        out = os.path.join(CACHE, f'out_{key}.mp3')
        meta = out + '.json'
        if key in only or not os.path.exists(out) or not os.path.exists(meta) or json.load(open(meta)).get('e') != e:
            samples, loop = process(decode(raw, e), e)
            encode(samples, out, e.get('kbps', 80))
            json.dump({'e': e, 'loop': loop, 'dur': len(samples) / SR}, open(meta, 'w'))
        m = json.load(open(meta))
        b = open(out, 'rb').read(); total += len(b)
        data[key] = {'l': m['loop'], 'd': base64.b64encode(b).decode()}
        credits.append((key, e['id'], info))
        print(f"{key:14} {m['dur']:5.2f}s {len(b) / 1024:6.1f} KB  {info['title'][:50]} — {info['user']}")
    with open(os.path.join(ROOT, 'js', 'sfxdata.js'), 'w') as f:
        f.write("'use strict';\n/* Recorded sound effects (CC0, from freesound.org — see CREDITS.md). Generated by tools/build-sfx.py; do not edit. */\n")
        f.write('const SFX_DATA = {\n')
        for k, v in data.items():
            f.write(f"  {json.dumps(k)}: {{ l: {json.dumps(v['l'])}, d: '{v['d']}' }},\n")
        f.write('};\n')
    with open(os.path.join(ROOT, 'CREDITS.md'), 'w') as f:
        f.write('# Sound credits\n\nAll sound effects are public-domain (CC0 1.0) recordings from [Freesound](https://freesound.org). ')
        f.write('No attribution is required, but thank you to everyone who shared them. ')
        f.write('They are trimmed, normalised and looped by `tools/build-sfx.py` from `tools/sfx-manifest.json`.\n\n')
        f.write('| In game | Sound | Author | License |\n|---|---|---|---|\n')
        for key, sid, info in credits:
            t = info['title'].replace('|', '/')
            f.write(f"| `{key}` | [{t}](https://freesound.org/s/{sid}/) | {info['user']} | [CC0 1.0](https://{CC0}) |\n")
    print(f'{len(data)} sounds, {total / 1024:.0f} KB mp3, {total * 4 / 3 / 1024:.0f} KB base64')


if __name__ == '__main__':
    main()
