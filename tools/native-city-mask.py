#!/usr/bin/env python3
"""Bake a ground-type mask PNG from district.json for the terrain shader.
R=road/asphalt, G=park/grass, B=water, A=lot/dirt. Base grey pavement where empty.
Run: python3 tools/native-city-mask.py
"""
import json, struct, zlib, sys
from pathlib import Path

data=json.load(open('native/assets/district.json'))
m=data['map']
size=int(m['size']);N=512
px=bytearray(N*N*4)
def fill_rect(x,y,w,h,rgba):
    x0=max(0,int(x/size*N));y0=max(0,int(y/size*N))
    x1=min(N,int((x+w)/size*N));y1=min(N,int((y+h)/size*N))
    for yy in range(y0,y1):
        base=(yy*N+x0)*4
        for xx in range(x1-x0):
            px[base+xx*4:base+xx*4+4]=bytes(rgba)
for lot in m.get('lots',[]):fill_rect(lot['x'],lot['y'],lot['w'],lot['h'],(0,0,0,255))
for park in m.get('parks',[]):fill_rect(park['x'],park['y'],park['w'],park['h'],(0,255,0,255))
for water in m.get('water',[]):fill_rect(water['x'],water['y'],water['w'],water['h'],(0,0,255,255))
for road in m.get('roads',[]):fill_rect(road['x'],road['y'],road['w'],road['h'],(255,0,0,255))
# rle-free PNG write (filter 0 rows)
raw=b''.join(b'\x00'+bytes(px[y*N*4:(y+1)*N*4]) for y in range(N))
def chunk(tag,data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',N,N,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b'')
Path('native/assets/city_mask.png').write_bytes(png)
print('MASK_OK',size,N,len(png))
