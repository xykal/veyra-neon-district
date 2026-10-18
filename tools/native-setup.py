#!/usr/bin/env python3
"""Install pinned official Godot in an external cache; verify official SHA-512 before execution."""
import argparse,hashlib,os,platform,shutil,subprocess,time,urllib.request,zipfile
from pathlib import Path
VERSION='4.7.2'
BASE=f'https://github.com/godotengine/godot/releases/download/{VERSION}-stable/'
def fetch(name,path):
    for attempt in range(4):
        try:
            temporary=path.with_suffix(path.suffix+'.part')
            with urllib.request.urlopen(urllib.request.Request(BASE+name,headers={'User-Agent':'Veyra-native-build'}),timeout=180) as r,temporary.open('wb') as f:
                while chunk:=r.read(4*1024*1024):f.write(chunk)
            temporary.replace(path);return
        except Exception:
            if attempt==3:raise
            time.sleep(attempt+1)
def checksum(path):
    h=hashlib.sha512()
    with path.open('rb') as f:
        while data:=f.read(4*1024*1024):h.update(data)
    return h.hexdigest()
def install(target,templates):
    cache=Path(os.environ.get('VEYRA_TOOLCHAIN_DIR',str(Path.home()/'.cache/veyra-native')));cache.mkdir(parents=True,exist_ok=True)
    sums=cache/'SHA512-SUMS.txt'
    if not sums.exists():fetch('SHA512-SUMS.txt',sums)
    mapping={}
    for line in sums.read_text().splitlines():
        chunks=line.split()
        if len(chunks)==2:mapping[chunks[1].lstrip('*')]=chunks[0]
    def verified(name):
        p=cache/name
        if not p.exists() or checksum(p)!=mapping.get(name):
            fetch(name,p)
            if checksum(p)!=mapping.get(name):p.unlink(missing_ok=True);raise RuntimeError('Official Godot checksum mismatch: '+name)
        return p
    editor_name=f'Godot_v{VERSION}-stable_'+('win64.exe.zip' if target=='windows' else 'linux.x86_64.zip')
    editor_dir=cache/('godot-'+target)
    if not editor_dir.exists():
        p=verified(editor_name);editor_dir.mkdir()
        with zipfile.ZipFile(p) as z:z.extractall(editor_dir)
    if target=='windows':exe=next(editor_dir.glob('*_console.exe'))
    else:exe=next(editor_dir.glob('Godot*'));exe.chmod(0o755)
    if templates:
        directory=Path(os.environ['APPDATA'])/'Godot/export_templates' if os.name=='nt' else Path.home()/'.local/share/godot/export_templates'
        directory=directory/(VERSION+'.stable');directory.mkdir(parents=True,exist_ok=True)
        required=['windows_release_x86_64.exe'] if templates=='windows' else ['android_release.apk','android_debug.apk']
        if any(not(directory/name).exists() for name in required):
            p=verified(f'Godot_v{VERSION}-stable_export_templates.tpz')
            with zipfile.ZipFile(p) as z:
                for name in z.namelist():
                    if Path(name).name in required or Path(name).name=='version.txt':
                        with z.open(name) as src,(directory/Path(name).name).open('wb') as dst:shutil.copyfileobj(src,dst)
    return exe
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--platform',choices=['windows','linux'],default='windows' if os.name=='nt' else 'linux');p.add_argument('--templates',choices=['windows','android']);p.add_argument('--github-env',type=Path);a=p.parse_args();exe=install(a.platform,a.templates)
    print('Verified official Godot',VERSION,str(exe))
    if a.github_env:
        with a.github_env.open('a') as f:f.write('GODOT_BIN='+str(exe)+'\nGODOT_VERSION='+VERSION+'\n')
