#!/usr/bin/env python3
"""Original Veyra Foley/SFX, synthesized from seeded noise and oscillators. No sampled recordings.

0.5 Lombok Direction adds consistent footstep surfaces, jump/land, vehicle enter/exit,
brake/scrape, engine start/stop, ocean/birds/thunder and UI confirm/back layers.
"""
import hashlib
import json
import math
import wave
from pathlib import Path

import numpy as np

RATE = 24000
rng = np.random.default_rng(71834)
out = Path('native/assets/audio')
out.mkdir(parents=True, exist_ok=True)
manifest = []


def write(name, x, loop=False):
    x = np.asarray(x)
    x = np.nan_to_num(x)
    peak = max(.01, float(np.max(np.abs(x))))
    x = x / max(1, peak / .9)
    pcm = (x * 32767).astype('<i2')
    p = out / (name + '.wav')
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    manifest.append({'name': name, 'seconds': round(len(x) / RATE, 3), 'loop': loop, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})


def time(s):
    return np.arange(int(RATE * s)) / RATE


def noise(t):
    return rng.normal(0, 1, len(t))


def lowpass(x, taps):
    return np.convolve(x, np.ones(taps) / taps, 'same')


def highpass(x, taps):
    return x - lowpass(x, taps)


def env_exp(t, rate):
    return np.exp(-t * rate)


def tone(t, hz, shape=None):
    phase = np.cumsum(np.full(len(t), 2 * math.pi * hz / RATE)) if np.isscalar(hz) else np.cumsum(hz / RATE * 2 * math.pi)
    return np.sin(phase)


def write_steps():
    surfaces = {
        'step_0': (95, 32, .55),
        'step_1': (110, 38, .58),
        'step_2': (88, 28, .5),
        'step_3': (120, 42, .52),
        'step_concrete': (120, 46, .62),
        'step_grass': (72, 24, .48),
        'step_dirt': (86, 30, .5),
        'step_sand': (62, 20, .36),
    }
    for name, (hz, decay, body) in surfaces.items():
        t = time(.2 if 'grass' not in name else .24)
        n = noise(t)
        low = lowpass(n, 13 if 'sand' not in name else 21)
        x = body * low * env_exp(t, decay) + .16 * tone(t, hz) * env_exp(t, decay * 1.25)
        if 'grass' in name or 'sand' in name:
            x += .08 * highpass(n, 5) * env_exp(t, 55)
        write(name, x)


def write_vehicle():
    for name, hz in [('engine_idle', 80), ('engine_mid', 140), ('engine_high', 220)]:
        t = time(1)
        x = sum(tone(t, hz * k) / (k ** 1.5) for k in range(1, 8)) * .17
        env = .83 + .17 * tone(t, 10)
        write(name, x * env, True)
    t = time(1.3)
    rpm = 55 + 210 * np.clip(t / 1.1, 0, 1) ** .7
    x = (.22 * tone(t, rpm) + .12 * tone(t, rpm * 2) + .08 * tone(t, rpm * .5)) * (0.2 + 0.8 * np.clip(t / .9, 0, 1))
    x += .05 * lowpass(noise(t), 9) * (0.3 + 0.7 * np.clip(t / 1.0, 0, 1))
    write('engine_start', x)
    t = time(.8)
    rpm = 180 * np.exp(-t * 2.4) + 55
    x = (.2 * tone(t, rpm) + .1 * tone(t, rpm * 2)) * env_exp(t, 1.4)
    write('engine_stop', x)
    t = time(.9)
    n = noise(t)
    x = highpass(n, 11) * .12 * (.7 + .3 * tone(t, 23))
    write('skid', x, True)
    t = time(1.1)
    n = lowpass(noise(t), 8)
    x = (n * .22 + highpass(noise(t), 6) * .12) * (.5 + .5 * np.sin(2 * math.pi * 1.7 * t))
    write('brake', x)
    t = time(1.4)
    n = highpass(noise(t), 7)
    x = (n * .16 + .1 * tone(t, 210 + 90 * np.sin(2 * math.pi * 2.2 * t))) * (.45 + .55 * np.abs(np.sin(2 * math.pi * 1.3 * t)))
    write('scrape', x, True)
    t = time(.22)
    write('door', tone(t, 170) * .36 * env_exp(t, 30) + noise(t) * .17 * env_exp(t, 48))
    t = time(.65)
    write('horn', (.22 * tone(t, 370) + .2 * tone(t, 465)) * np.minimum(1, t * 60) * np.minimum(1, (.65 - t) * 35))
    t = time(2)
    f = 650 + 350 * np.sin(2 * np.pi * .5 * t)
    write('siren', np.sin(np.cumsum(f / RATE * 2 * np.pi)) * .18, True)
    t = time(.5)
    write('engine_key', tone(t, 1200) * .12 * env_exp(t, 18) + tone(t, 780) * .08 * env_exp(t, 26))


def write_combat():
    t = time(.28)
    write('shot', noise(t) * .25 * env_exp(t, 36) + tone(t, 110 - 40 * t) * .6 * env_exp(t, 45))
    t = time(.46)
    write('impact', lowpass(noise(t), 17) * .65 * env_exp(t, 13) + tone(t, 68) * .38 * env_exp(t, 22))
    t = time(.34)
    write('punch', lowpass(noise(t), 9) * .7 * env_exp(t, 26) + tone(t, 95) * .28 * env_exp(t, 30))
    t = time(.28)
    write('ragdoll_hit', lowpass(noise(t), 15) * .48 * env_exp(t, 18) + tone(t, 74) * .3 * env_exp(t, 24))


def write_foot_and_motion():
    t = time(.2)
    write('jump', tone(t, 210) * .16 * env_exp(t, 24) + highpass(noise(t), 8) * .08 * env_exp(t, 30))
    t = time(.4)
    write('land', lowpass(noise(t), 20) * .55 * env_exp(t, 18) + tone(t, 90) * .23 * env_exp(t, 25))
    t = time(.32)
    write('land_hard', lowpass(noise(t), 14) * .8 * env_exp(t, 12) + tone(t, 62) * .34 * env_exp(t, 18))
    t = time(1.2)
    write('cloth', lowpass(noise(t), 26) * .16 * (0.4 + 0.6 * np.abs(np.sin(2 * math.pi * 1.9 * t))))
    t = time(2)
    write('wind', lowpass(noise(t), 260) * .6, True)
    t = time(2)
    write('wind_high', highpass(lowpass(noise(t), 120), 18) * .34, True)
    t = time(2)
    write('rain', lowpass(noise(t), 3) * .1, True)
    t = time(1.6)
    rumble = lowpass(noise(t), 220) * np.exp(-t * .9)
    write('thunder', rumble * .8)
    t = time(2.2)
    swell = .35 + .25 * np.sin(2 * math.pi * .11 * t) + .12 * np.sin(2 * math.pi * .23 * t + 1.1)
    write('ocean', lowpass(noise(t), 320) * swell * .42, True)
    t = time(1.8)
    chirp = np.zeros_like(t)
    for start, hz in [(.15, 2100), (.55, 2450), (1.05, 1980), (1.35, 2600)]:
        seg = (t >= start) & (t < start + .18)
        lt = t[seg] - start
        chirp[seg] += np.sin(2 * np.pi * hz * lt) * np.sin(np.pi * lt / .18) ** 2
    write('birds', chirp * .18)


def write_ui():
    t = time(.16)
    write('ui', tone(t, 720 + 220 * t) * np.sin(np.pi * t / .16) ** 2 * .14)
    t = time(.22)
    write('ui_confirm', tone(t, 620) * .12 * env_exp(t, 18) + tone(t, 920) * .1 * env_exp(t, 12))
    t = time(.18)
    write('ui_back', tone(t, 420) * .12 * env_exp(t, 20) + tone(t, 300) * .1 * env_exp(t, 16))
    t = time(.32)
    write('ui_level', tone(t, 520 + 280 * t) * .12 * (t < .28))


if __name__ == '__main__':
    write_steps()
    write_vehicle()
    write_combat()
    write_foot_and_motion()
    write_ui()
    (out / 'manifest.json').write_text(json.dumps({
        'author': 'Veyra contributors',
        'license': 'MIT',
        'sampleRate': RATE,
        'revision': '0.5-lombok-direction',
        'files': manifest,
    }, indent=2) + '\n')
    total = sum((out / (x['name'] + '.wav')).stat().st_size for x in manifest)
    print(f'Original spatial SFX generated: {len(manifest)} mono WAVs, {total} bytes')
