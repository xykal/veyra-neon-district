#!/usr/bin/env python3
"""Brand the native boot splash and launcher icon. No Godot logo, only Veyra art."""
import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path('native/assets')
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def gradient_text(draw, xy, text, font, top, bottom, spacing=0):
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    layer = Image.new('RGBA', (int(w) + 20, int(h) + 20), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((10, 10), text, font=font, fill=(255, 255, 255, 255))
    grad = Image.new('RGBA', layer.size, top + (255,))
    gd = ImageDraw.Draw(grad)
    for i in range(layer.size[1]):
        t = i / max(1, layer.size[1] - 1)
        col = tuple(int(top[c] * (1 - t) + bottom[c] * t) for c in range(3)) + (255,)
        gd.line([(0, i), (layer.size[0], i)], fill=col)
    grad.putalpha(layer.split()[3])
    out = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), grad)
    draw._image.alpha_composite(out, (int(x) - 10, int(y) - 10))


def make_splash(source: Path, output: Path):
    img = Image.open(source).convert('RGBA')
    w, h = img.size
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Soft central vignette so the title stays readable on any generated sky.
    for i in range(12):
        alpha = int(72 - i * 5)
        box = (w * .18 + i * 12, h * .18 + i * 8, w * .82 - i * 12, h * .82 - i * 8)
        d.rounded_rectangle(box, radius=80, fill=(6, 12, 24, max(0, alpha)))
    img = Image.alpha_composite(img, overlay)
    d = ImageDraw.Draw(img)
    title = ImageFont.truetype(FONT_BOLD, 118)
    sub = ImageFont.truetype(FONT_REG, 34)
    tag = ImageFont.truetype(FONT_BOLD, 26)
    cx = w // 2
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    t = 'VEYRA'
    bbox = sd.textbbox((0, 0), t, font=title)
    tw = bbox[2] - bbox[0]
    sd.text((cx - tw / 2 + 5, h * .31 + 6), t, font=title, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    img = Image.alpha_composite(img, shadow)
    d = ImageDraw.Draw(img)
    gradient_text(d, (cx - tw / 2, h * .31), t, title, (236, 255, 244), (94, 214, 190))
    s = 'N E O N   D I S T R I C T'
    bbox = d.textbbox((0, 0), s, font=sub)
    sw = bbox[2] - bbox[0]
    d.text((cx - sw / 2, h * .31 + 132), s, font=sub, fill=(196, 232, 218, 235))
    pill = 'NATIVE 0.5 · LOMBOK DIRECTION'
    bbox = d.textbbox((0, 0), pill, font=tag)
    pw = bbox[2] - bbox[0] + 42
    d.rounded_rectangle((cx - pw / 2, h * .31 + 196, cx + pw / 2, h * .31 + 244), radius=22, fill=(8, 22, 32, 170), outline=(126, 214, 190, 180), width=2)
    d.text((cx - pw / 2 + 21, h * .31 + 207), pill, font=tag, fill=(170, 232, 210, 240))
    small = ImageFont.truetype(FONT_REG, 18)
    credit = 'Bukan GTA asset · MIT + CC0 · build asli Godot'
    bbox = d.textbbox((0, 0), credit, font=small)
    d.text((cx - (bbox[2] - bbox[0]) / 2, h * .88), credit, font=small, fill=(220, 232, 228, 170))
    img.convert('RGB').save(output, quality=94)
    return output


def make_icon(output: Path, size=512):
    img = Image.new('RGBA', (size, size), (8, 18, 28, 255))
    d = ImageDraw.Draw(img)
    for i in range(size):
        t = i / size
        col = (int(12 + t * 26), int(28 + t * 78), int(38 + t * 62))
        d.line([(0, i), (size, i)], fill=col)
    # Stylized V with a neon coast curve.
    d.polygon([(size * .22, size * .22), (size * .5, size * .76), (size * .78, size * .22), (size * .66, size * .22), (size * .5, size * .52), (size * .34, size * .22)], fill=(126, 226, 196, 255))
    d.arc((size * .1, size * .52, size * .9, size * .98), start=200, end=340, fill=(238, 174, 92, 255), width=int(size * .035))
    img.save(output)
    return output


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=ROOT / 'boot_splash.png')
    ap.add_argument('--output', type=Path, default=ROOT / 'boot_splash_branded.png')
    ap.add_argument('--icon', type=Path, default=ROOT / 'icon_native.png')
    args = ap.parse_args()
    print('splash', make_splash(args.source, args.output))
    print('icon', make_icon(args.icon))
