#!/usr/bin/env python3
"""Render every spoken line in Loot Run with the Kokoro text-to-speech model and embed them in js/voicedata.js.

Kokoro-82M (https://huggingface.co/hexgrad/Kokoro-82M) is an open-weight TTS model under the Apache-2.0 license;
this uses the ONNX build (kokoro-onnx). Lines come from tools/voice-lines.json plus the mission dialogue (Vera, Dixie, Earl, Sal),
read straight out of js/game.js so the voice always matches the text on screen.

Run it with uv, which fetches a compatible Python and the packages:
  uv run --python 3.12 --with kokoro-onnx --with soundfile tools/build-voice.py --model DIR
DIR must hold kokoro-v1.0.onnx and voices-v1.0.bin from
  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Renders are cached in .voice-cache/, so editing one line only re-renders that line.
"""
import argparse, base64, hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.voice-cache')
FORMATS = {  # sample rate, bitrate per kind of line
    'vera': (24000, 40), 'bark': (24000, 32), 'radio': (16000, 24),
}


SPEAKERS = {'V': 'vera', 'DIX': 'dixie', 'EARL': 'earl', 'SAL': 'sal', 'SARGE': 'sarge'}  # the constants game.js uses in [WHO, 'line'] pairs


def dialog_lines():
    """every mission line, as (speaker, text), in the order they appear in js/game.js"""
    src = open(os.path.join(ROOT, 'js', 'game.js'), encoding='utf8').read()
    out = []
    for m in re.finditer(r"\[(V|DIX|EARL|SAL|SARGE), (\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*')\]", src):
        s = m.group(2)[1:-1].replace("\\'", "'").replace('\\"', '"')
        key = (SPEAKERS[m.group(1)], s)
        if key not in out: out.append(key)
    return out


def county_roads():
    src = open(os.path.join(ROOT, 'js', 'outer.js'), encoding='utf8').read()
    return re.findall(r"\{ name: '([^']+)', pts:", src)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--model', required=True); a = ap.parse_args()
    from kokoro_onnx import Kokoro
    import numpy as np, soundfile as sf
    tts = Kokoro(os.path.join(a.model, 'kokoro-v1.0.onnx'), os.path.join(a.model, 'voices-v1.0.bin'))
    os.makedirs(CACHE, exist_ok=True)
    spec = json.load(open(os.path.join(ROOT, 'tools', 'voice-lines.json')))
    V = spec['voices']
    jobs = []  # (key, text, voice, speed, kind)
    count = {}
    for who, t in dialog_lines():
        i = count.get(who, 0); count[who] = i + 1
        jobs.append((f'{who}/{i}', t, V[who], 1.0 if who == 'vera' else 0.97, 'vera'))
    for g, b in spec['barks'].items():
        # every line in every voice of the role: a person picks one voice and keeps it for everything they shout
        for i, t in enumerate(b['lines']):
            for j, voice in enumerate(V[b['role']]): jobs.append((f'bark/{g}/{i}/{j}', t, voice, 1.05, 'bark'))
    for k, t in spec['radio']['dispatch'].items(): jobs.append((f'dispatch/{k}', t, V['dispatch'], 1.08, 'radio'))
    for k, t in spec['radio']['unit'].items():
        for j, voice in enumerate(V['unit']): jobs.append((f'unit/{k}/{j}', t, voice, 1.05, 'radio'))
    for k, t in spec['places'].items(): jobs.append((f'place/{k}', t, V['dispatch'], 1.08, 'radio'))
    for name in county_roads(): jobs.append((f'road/{name}', f'On {name}.', V['dispatch'], 1.08, 'radio'))
    for ew in spec['streets']['ew']:
        for ns in spec['streets']['ns']: jobs.append((f'x/{ew}/{ns}', f'{ew} and {ns}.', V['dispatch'], 1.08, 'radio'))

    data, texts, total, rendered = {}, {}, 0, 0
    for key, text, voice, speed, kind in jobs:
        h = hashlib.sha1(f'{voice}|{speed}|{text}'.encode()).hexdigest()[:16]
        wav, mp3 = os.path.join(CACHE, h + '.wav'), os.path.join(CACHE, f'{h}_{kind}.mp3')
        if not os.path.exists(wav):
            s, sr = tts.create(text, voice=voice, speed=speed, lang='en-us')
            s = np.asarray(s, dtype=np.float32)
            loud = np.where(np.abs(s) > 0.01)[0]  # trim the silence Kokoro leaves at either end
            if len(loud): s = s[max(0, loud[0] - int(0.03 * sr)): loud[-1] + int(0.06 * sr)]
            s = s / (np.max(np.abs(s)) + 1e-9) * 0.89
            sf.write(wav, s, sr); rendered += 1
        if not os.path.exists(mp3):
            rate, kbps = FORMATS[kind]
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', str(rate), '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', mp3], check=True)
        b = open(mp3, 'rb').read(); total += len(b)
        data[key] = base64.b64encode(b).decode()
        if kind == 'vera': texts[text] = key
    with open(os.path.join(ROOT, 'js', 'voicedata.js'), 'w') as f:
        f.write("'use strict';\n/* Spoken lines, rendered with the Kokoro TTS model (Apache-2.0) by tools/build-voice.py from tools/voice-lines.json. Do not edit. */\n")
        f.write('const VOICE_TEXT = ' + json.dumps(texts, ensure_ascii=False) + ';\n')
        f.write('const VOICE_DATA = {\n')
        for k, v in data.items(): f.write(f"  {json.dumps(k)}: '{v}',\n")
        f.write('};\n')
    print(f'{len(jobs)} lines ({rendered} newly rendered), {total / 1024:.0f} KB mp3, {total * 4 / 3 / 1024:.0f} KB base64')


if __name__ == '__main__':
    sys.exit(main())
