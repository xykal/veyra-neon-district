#!/usr/bin/env python3
"""Generate the Lombok-inspired island scenery layer for Veyra Native.

Keeps the shared online city plan intact (same roads/POIs/spawns) and adds an
expandable island shell: mountains, coast, rice terraces, palms, warungs, rocks.
The same deterministic data can later be replaced by surveyed Lombok coordinates.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

OUT = Path('native/assets/island.json')
WORLD = 480.0
FLAT_RADIUS = 250.0
SEA_LEVEL = -0.55


def scatter(rng, count, min_r, max_r, center=(WORLD / 2, WORLD / 2), avoid=(), avoid_r=10.0):
    points = []
    guard = 0
    while len(points) < count and guard < count * 40:
        guard += 1
        ang = rng.uniform(0, math.tau)
        rad = math.sqrt(rng.uniform((min_r / max_r) ** 2, 1.0)) * max_r
        x = center[0] + math.cos(ang) * rad
        y = center[1] + math.sin(ang) * rad
        if not (-240 < x < WORLD + 240 and -240 < y < WORLD + 240):
            continue
        if any((x - ax) ** 2 + (y - ay) ** 2 < avoid_r ** 2 for ax, ay in avoid):
            continue
        points.append((x, y))
    return points


def build(seed=20251018):
    rng = np.random.default_rng(seed)
    # Peaks sit outside the collision-flat city shell so roads/buildings never float.
    peaks = [
        {'x': -110.0, 'y': 90.0, 'height': 30.0, 'radius': 120.0, 'tone': 0},
        {'x': 595.0, 'y': 105.0, 'height': 22.0, 'radius': 105.0, 'tone': 1},
        {'x': 610.0, 'y': 530.0, 'height': 27.0, 'radius': 118.0, 'tone': 0},
        {'x': -95.0, 'y': 540.0, 'height': 19.0, 'radius': 98.0, 'tone': 2},
        {'x': 250.0, 'y': 660.0, 'height': 16.0, 'radius': 110.0, 'tone': 1},
    ]
    beaches = [
        {'x': 520.0, 'y': 250.0, 'radius': 70.0},
        {'x': 250.0, 'y': -20.0, 'radius': 66.0},
        {'x': -20.0, 'y': 250.0, 'radius': 62.0},
        {'x': 250.0, 'y': 520.0, 'radius': 68.0},
    ]
    rice = []
    for cx, cy in [(-70, 240), (560, 250), (240, -70), (250, 570), (560, 560)]:
        rice.append({
            'x': cx + float(rng.uniform(-14, 14)),
            'y': cy + float(rng.uniform(-14, 14)),
            'w': float(rng.uniform(42, 68)),
            'h': float(rng.uniform(34, 52)),
            'levels': int(rng.integers(5, 8)),
            'yaw': float(rng.uniform(-0.5, 0.5)),
        })

    avoid = [(p['x'], p['y']) for p in peaks] + [(r['x'], r['y']) for r in rice]
    palms = []
    for x, y in scatter(rng, 300, 255, 360, avoid=avoid, avoid_r=16):
        palms.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.9, 1.45)), 2), round(float(rng.uniform(0, math.tau)), 2)])
    shrubs = []
    for x, y in scatter(rng, 280, 250, 355, avoid=avoid, avoid_r=10):
        shrubs.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.55, 1.25)), 2)])
    grass = []
    for x, y in scatter(rng, 420, 248, 350, avoid=avoid, avoid_r=6):
        grass.append([round(x, 2), round(y, 2), round(float(rng.uniform(0, math.tau)), 2), int(rng.integers(0, 3))])

    warungs = []
    for x, y in scatter(rng, 20, 232, 248, avoid=avoid, avoid_r=18):
        warungs.append({'x': round(x, 2), 'y': round(y, 2), 'yaw': round(float(rng.uniform(0, math.tau)), 3), 'tone': int(rng.integers(0, 3))})
    rocks = []
    for x, y in scatter(rng, 64, 248, 352, avoid=avoid, avoid_r=12):
        rocks.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.5, 1.6)), 2), round(float(rng.uniform(0, math.tau)), 2)])
    docks = []
    for beach in beaches:
        ang = math.atan2(beach['y'] - WORLD / 2, beach['x'] - WORLD / 2)
        docks.append({'x': round(beach['x'] + math.cos(ang) * 18, 2), 'y': round(beach['y'] + math.sin(ang) * 18, 2), 'yaw': round(ang + math.pi / 2, 3)})
    villages = []
    for x, y in scatter(rng, 12, 250, 330, avoid=avoid, avoid_r=22):
        villages.append({'x': round(x, 2), 'y': round(y, 2), 'yaw': round(float(rng.uniform(0, math.tau)), 3)})

    return {
        'version': 2,
        'name': 'Lombok Direction — expandable island shell',
        'seed': seed,
        'worldSize': WORLD,
        'flatRadius': FLAT_RADIUS,
        'seaLevel': SEA_LEVEL,
        'peaks': peaks,
        'beaches': beaches,
        'rice': rice,
        'palms': palms,
        'shrubs': shrubs,
        'grass': grass,
        'warungs': warungs,
        'rocks': rocks,
        'docks': docks,
        'villages': villages,
        'note': 'Procedural Lombok-inspired terrain around the existing shared city plan. Replace arrays with surveyed Lombok GIS data for the full island later.',
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=20251018)
    ap.add_argument('--output', type=Path, default=OUT)
    args = ap.parse_args()
    data = build(args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f'Wrote {args.output} {args.output.stat().st_size} bytes sha256={digest}')
    print('features:', {k: len(v) for k, v in data.items() if isinstance(v, list)})
