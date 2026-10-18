#!/usr/bin/env python3
"""Veyra 0.5 streetwear pass: baggier pants, roomier jackets, chunkier boots.

The CC0 Quaternius topology, skeleton, skin weights and animation clips are preserved.
Only garment POSITION bytes are rewritten in-place, so LODs/import paths stay stable.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

DT = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}
TYPES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path: Path):
    blob = path.read_bytes()
    total, version, _ = struct.unpack_from('<III', blob, 0)
    if blob[:4] != b'glTF' or version != 2:
        raise SystemExit(f'Not a GLB2 file: {path}')
    off = 12
    js = None
    binary = None
    while off + 8 <= len(blob):
        clen, ctype = struct.unpack_from('<II', blob, off)
        chunk = blob[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        elif ctype == 0x004E4942:
            binary = bytearray(chunk)
        off += 8 + clen
    if js is None or binary is None:
        raise SystemExit(f'GLB missing JSON/BIN chunk: {path}')
    return blob, js, binary


def accessor_span(g, binary, index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    dt = np.dtype(DT[a['componentType']])
    n = TYPES[a['type']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', dt.itemsize * n)
    arr = np.ndarray((a['count'], n), dtype=dt, buffer=binary, offset=start, strides=(stride, dt.itemsize))
    return arr, start, stride, dt, n


def rewrite_glb(path: Path, g, binary):
    text = json.dumps(g, separators=(',', ':')).encode()
    text += b' ' * ((-len(text)) % 4)
    binary.extend(b'\0' * ((-len(binary)) % 4))
    blob = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
    blob += struct.pack('<II', len(text), 0x4E4F534A) + text
    blob += struct.pack('<II', len(binary), 0x004E4942) + bytes(binary)
    path.write_bytes(blob)
    return len(blob)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / max(1e-6, (edge1 - edge0)), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def style_positions(name: str, pos: np.ndarray, seed: int) -> np.ndarray:
    out = pos.astype(np.float32).copy()
    y = out[:, 1]
    x = out[:, 0]
    z = out[:, 2]
    if name == 'PantsLong':
        # Cargo/baggy silhouette: thigh volume, knee break, wide ankle opening.
        thigh = smoothstep(1.02, 0.72, y) * smoothstep(0.18, 0.36, y)
        shin = smoothstep(0.72, 0.30, y) * smoothstep(0.10, 0.24, y)
        ankle = smoothstep(0.36, 0.14, y)
        side = np.sign(x + 1e-5)
        out[:, 0] += side * (0.035 * thigh + 0.055 * shin + 0.035 * ankle)
        out[:, 2] += np.sign(z + 1e-5) * (0.028 * thigh + 0.05 * shin + 0.03 * ankle)
        out[:, 0] *= 1.018
        out[:, 2] *= 1.045
        # Subtle asymmetric cuff break so the pants do not look mirrored-pasted.
        out[:, 1] -= 0.012 * ankle * (0.5 + 0.5 * np.sin(seed * 0.17 + x * 8.0))
    elif name == 'PantsShort':
        thigh = smoothstep(1.02, 0.62, y) * smoothstep(0.42, 0.58, y)
        out[:, 0] += np.sign(x + 1e-5) * 0.045 * thigh
        out[:, 2] += np.sign(z + 1e-5) * 0.035 * thigh
        out[:, 0] *= 1.015
        out[:, 2] *= 1.04
    elif name in ('TopLong', 'TopShort'):
        torso = smoothstep(0.88, 1.02, y) * smoothstep(1.62, 1.42, y)
        shoulder = smoothstep(1.32, 1.52, y) * smoothstep(1.68, 1.52, y)
        hem = smoothstep(1.02, 0.88, y)
        out[:, 0] *= 1.0 + 0.045 * torso + 0.035 * shoulder
        out[:, 2] *= 1.0 + 0.05 * torso + 0.025 * shoulder
        out[:, 0] += np.sign(x + 1e-5) * 0.018 * shoulder
        # Jacket/oversized tee drape.
        out[:, 1] -= 0.045 * hem
        if name == 'TopLong':
            sleeve = smoothstep(1.42, 1.20, y) * smoothstep(0.86, 1.04, y)
            out[:, 0] += np.sign(x + 1e-5) * 0.03 * sleeve
            out[:, 2] += np.sign(z + 1e-5) * 0.022 * sleeve
    elif name == 'Boots':
        foot = smoothstep(0.30, 0.06, y)
        out[:, 1] -= 0.012 * foot
        out[:, 0] *= 1.0 + 0.06 * foot
        out[:, 2] *= 1.0 + 0.075 * foot
    return out


def process(path: Path, report_only: bool = False):
    blob, g, binary = load_glb(path)
    changed = {}
    for node in g['nodes']:
        if 'mesh' not in node:
            continue
        name = str(node.get('name', ''))
        if name not in {'PantsLong', 'PantsShort', 'TopLong', 'TopShort', 'Boots'}:
            continue
        mesh = g['meshes'][node['mesh']]
        for prim in mesh['primitives']:
            if 'POSITION' not in prim.get('attributes', {}):
                continue
            arr, start, stride, dt, n = accessor_span(g, binary, prim['attributes']['POSITION'])
            original = arr.copy()
            styled = style_positions(name, original, seed=len(name))
            arr[:] = styled.astype(dt)
            delta = float(np.max(np.abs(styled - original)))
            changed[name] = round(delta, 4)
    if report_only:
        return {'file': path.name, 'changes': changed, 'sha256': hashlib.sha256(blob).hexdigest()}
    size = rewrite_glb(path, g, binary)
    return {
        'file': path.name,
        'bytes': size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'maxOffsetMetres': changed,
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', type=Path, default=Path('native/assets/people'))
    ap.add_argument('--report-only', action='store_true')
    args = ap.parse_args()
    results = [process(p, args.report_only) for p in sorted(args.input.glob('citizen_*.glb'))]
    if not args.report_only:
        manifest_path = args.input / 'fashion-manifest.json'
        manifest_path.write_text(json.dumps({
            'license': 'CC0-1.0 source meshes + MIT streetwear silhouette pass',
            'note': 'Baggy pants, oversized tops and chunkier boots. Skeleton/clips unchanged.',
            'assets': results,
        }, indent=2) + '\n')
    print(json.dumps(results, indent=2))
