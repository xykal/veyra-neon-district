#!/usr/bin/env python3
"""Generate a real Lombok-shaped island shell for Veyra Native.

The shared online city plan (roads/POIs/spawns) is preserved; this tool adds a
coastline polygon inspired by Pulau Lombok, Mount Rinjani in the north, Gili
islets off the west coast, southern Mandalika beaches and eastern Sembalun hills.
Replace `outline`/`heights` with surveyed GIS data for a full recreation later.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

OUT = Path('native/assets/island.json')
DISTRICT = Path('native/assets/district.json')
WORLD = 480.0
SEA_LEVEL = -0.55

# Approximate Lombok coastline in world metres (x east, z south). City sits on
# the western Mataram plain at 0..480; the island extends beyond it.
OUTLINE = [
    [60, 40], [110, -30], [190, -95], [300, -155], [415, -115], [505, -35],
    [575, 60], [635, 175], [645, 295], [595, 405], [525, 485], [435, 545],
    [325, 595], [215, 605], [125, 555], [65, 475], [28, 375], [12, 255],
    [18, 145], [38, 70],
]

ISLETS = [
    {'x': -105, 'y': 165, 'r': 26},   # Gili Air
    {'x': -128, 'y': 212, 'r': 30},   # Gili Trawangan
    {'x': -98, 'y': 258, 'r': 22},    # Gili Meno
]

HEIGHTS = [
    {'x': 305, 'y': -60, 'height': 48.0, 'radius': 175},   # Rinjani
    {'x': 470, 'y': 15, 'height': 13.0, 'radius': 110},    # Sembalun hills
    {'x': 250, 'y': 545, 'height': 11.0, 'radius': 95},    # Mandalika dunes
    {'x': 55, 'y': 470, 'height': 9.0, 'radius': 80},      # Sekotong
    {'x': 560, 'y': 330, 'height': 8.0, 'radius': 90},     # east hills
]

LAKES = [
    {'x': 288, 'y': -35, 'radius': 22, 'depth': 5.0},      # Segara Anak
]

POI_NAMES = [
    'Bank NTB Mataram', 'Bank Ampenan', 'RSUD Provinsi NTB', 'Puskesmas Ampenan',
    'Polresta Mataram', 'Pos Pantai Senggigi', 'Hotel Senggigi Beach', 'Hotel Kuta Lombok',
    'Kafe Gili Trawangan', 'Kopi Senaru', 'Warung Sade', 'Resto Selong Blanak',
    'Pasar Mandalika', 'Pasar Tanjung', 'SPBU Mataram', 'SPBU Praya',
    'Taman Narmada', 'Taman Tetebatu', 'Kantor Gubernur NTB', 'Sekolah Sembalun',
    'Gudang Pelabuhan Lembar', 'Bengkel Mandalika',
]


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1
            if x < xin:
                inside = not inside
    return inside


def edge_distance(x, y, poly):
    best = 1e9
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy + 1e-9)))
        px, py = x1 + t * dx, y1 + t * dy
        best = min(best, math.hypot(x - px, y - py))
    return best


def scatter(rng, count, min_city_dist, max_edge_dist, edge_range=None, avoid=(), avoid_r=10.0):
    points = []
    guard = 0
    while len(points) < count and guard < count * 60:
        guard += 1
        x = rng.uniform(-140, 660)
        y = rng.uniform(-170, 630)
        if not point_in_poly(x, y, OUTLINE):
            continue
        edge = edge_distance(x, y, OUTLINE)
        if edge_range and not (edge_range[0] <= edge <= edge_range[1]):
            continue
        if edge < max_edge_dist:
            continue
        dcity = math.hypot(x - WORLD / 2, y - WORLD / 2)
        if dcity < min_city_dist:
            continue
        if any((x - ax) ** 2 + (y - ay) ** 2 < avoid_r ** 2 for ax, ay in avoid):
            continue
        points.append((x, y))
    return points


def build(seed=20251018):
    rng = np.random.default_rng(seed)
    avoid = [(h['x'], h['y']) for h in HEIGHTS] + [(l['x'], l['y']) for l in LAKES]

    palms = []
    for x, y in scatter(rng, 340, 232, 12, edge_range=(16, 260), avoid=avoid, avoid_r=14):
        palms.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.9, 1.5)), 2), round(float(rng.uniform(0, math.tau)), 2)])
    for islet in ISLETS:
        for _ in range(10):
            ang = rng.uniform(0, math.tau)
            rad = rng.uniform(2, islet['r'] * 0.8)
            palms.append([round(islet['x'] + math.cos(ang) * rad, 2), round(islet['y'] + math.sin(ang) * rad, 2), round(float(rng.uniform(0.75, 1.05)), 2), round(float(rng.uniform(0, math.tau)), 2)])

    shrubs = []
    for x, y in scatter(rng, 300, 238, 12, edge_range=(10, 250), avoid=avoid, avoid_r=9):
        shrubs.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.55, 1.3)), 2)])
    grass = []
    for x, y in scatter(rng, 460, 236, 10, edge_range=(8, 250), avoid=avoid, avoid_r=5):
        grass.append([round(x, 2), round(y, 2), round(float(rng.uniform(0, math.tau)), 2), int(rng.integers(0, 3))])

    rice = []
    for cx, cy in [(-70, 240), (560, 250), (240, -120), (250, 585), (560, 520)]:
        rice.append({
            'x': cx + float(rng.uniform(-16, 16)),
            'y': cy + float(rng.uniform(-16, 16)),
            'w': float(rng.uniform(46, 78)),
            'h': float(rng.uniform(38, 58)),
            'levels': int(rng.integers(5, 8)),
            'yaw': float(rng.uniform(-0.5, 0.5)),
        })

    warungs = []
    for x, y in scatter(rng, 22, 228, 12, edge_range=(16, 70), avoid=avoid, avoid_r=16):
        warungs.append({'x': round(x, 2), 'y': round(y, 2), 'yaw': round(float(rng.uniform(0, math.tau)), 3), 'tone': int(rng.integers(0, 3))})
    rocks = []
    for x, y in scatter(rng, 70, 242, 12, edge_range=(10, 250), avoid=avoid, avoid_r=10):
        rocks.append([round(x, 2), round(y, 2), round(float(rng.uniform(0.5, 1.7)), 2), round(float(rng.uniform(0, math.tau)), 2)])
    docks = []
    for x, y, yaw in [(150, -70, 0.2), (620, 260, 1.4), (320, 585, 3.0), (20, 320, -1.4)]:
        if point_in_poly(x, y, OUTLINE):
            docks.append({'x': x, 'y': y, 'yaw': round(yaw, 3)})
    villages = []
    for x, y in scatter(rng, 14, 250, 12, edge_range=(30, 230), avoid=avoid, avoid_r=20):
        villages.append({'x': round(x, 2), 'y': round(y, 2), 'yaw': round(float(rng.uniform(0, math.tau)), 3)})

    return {
        'version': 3,
        'name': 'Pulau Lombok — Veyra direction shell',
        'seed': seed,
        'worldSize': WORLD,
        'seaLevel': SEA_LEVEL,
        'outline': OUTLINE,
        'islets': ISLETS,
        'heights': HEIGHTS,
        'lakes': LAKES,
        'rice': rice,
        'palms': palms,
        'shrubs': shrubs,
        'grass': grass,
        'warungs': warungs,
        'rocks': rocks,
        'docks': docks,
        'villages': villages,
        'places': {
            'city': 'Mataram',
            'volcano': 'Gunung Rinjani',
            'beach_south': 'Kuta Mandalika',
            'beach_west': 'Senggigi',
            'islands': ['Gili Air', 'Gili Trawangan', 'Gili Meno'],
            'valley': 'Sembalun',
            'port': 'Pelabuhan Lembar',
        },
        'note': 'Lombok-shaped island shell around the shared city plan. Replace outline/heights with surveyed Lombok GIS data for the full island.',
    }


def rename_pois():
    data = json.loads(DISTRICT.read_text())
    pois = data['map']['pois']
    for i, p in enumerate(pois):
        if i < len(POI_NAMES):
            p['name'] = POI_NAMES[i]
    data['map']['label'] = 'Mataram · Pulau Lombok'
    data['places'] = {'island': 'Lombok', 'city': 'Mataram'}
    DISTRICT.write_text(json.dumps(data, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=20251018)
    ap.add_argument('--output', type=Path, default=OUT)
    args = ap.parse_args()
    data = build(args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    rename_pois()
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f'Wrote {args.output} {args.output.stat().st_size} bytes sha256={digest}')
    print('features:', {k: len(v) for k, v in data.items() if isinstance(v, list)})
    print('POIs renamed to Lombok places:', len(POI_NAMES))
