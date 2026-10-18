#!/usr/bin/env python3
"""Export real native packages. Signing credentials are environment-only, never runtime assets."""
import argparse,json,os,subprocess,zipfile,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(godot,args):
    r=subprocess.run([str(godot),'--headless','--path',str(ROOT/'native'),*args],cwd=ROOT,capture_output=True,text=True,timeout=240)
    text=r.stdout+r.stderr
    for key,value in os.environ.items():
        if any(k in key for k in ['PASSWORD','TOKEN','KEYSTORE_RELEASE_PATH']) and len(value)>8:text=text.replace(value,'[REDACTED]')
    if r.returncode or any('ERROR:' in x or 'SCRIPT ERROR' in x for x in text.splitlines()):print(text[-10000:]);raise RuntimeError('Native export failed.')
    print('\n'.join(x for x in text.splitlines() if 'Signing release' in x or 'Verifying' in x))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--godot',type=Path,default=os.environ.get('GODOT_BIN'));p.add_argument('--target',choices=['windows','android'],required=True);p.add_argument('--commit',default=os.environ.get('GITHUB_SHA','local'));a=p.parse_args()
    if not a.godot:raise SystemExit('Set GODOT_BIN or pass --godot.')
    out=ROOT/'dist/native';out.mkdir(parents=True,exist_ok=True)
    (ROOT/'native/assets/build-info.json').write_text(json.dumps({'app':'Veyra Native','version':'0.5.0-alpha.1','commit':a.commit})+'\n')
    if a.target=='android':
        sdk=os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME');java=os.environ.get('JAVA_HOME')
        if not sdk or not java:raise SystemExit('Set private Android SDK/JDK paths.')
        config=Path(os.environ.get('APPDATA',str(Path.home()/'.config')))/'Godot' if os.name=='nt' else Path.home()/'.config/godot';config.mkdir(parents=True,exist_ok=True)
        settings=config/'editor_settings-4.7.tres'
        text=settings.read_text() if settings.exists() else '[gd_resource type="EditorSettings" format=3]\n\n[resource]\n'
        import re
        for key,val in [('export/android/android_sdk_path',sdk),('export/android/java_sdk_path',java)]:
            line=key+' = '+json.dumps(str(val).replace('\\','/'))
            if re.search('^'+re.escape(key)+' =.*$',text,re.M):text=re.sub('^'+re.escape(key)+' =.*$',lambda m:line,text,flags=re.M)
            else:text+='\n'+line+'\n'
        settings.write_text(text)
    r=subprocess.run([str(a.godot),'--headless','--editor','--path',str(ROOT/'native'),'--import'],capture_output=True,text=True,timeout=180)
    if r.returncode or 'SCRIPT ERROR' in r.stdout+r.stderr:raise RuntimeError('Native asset import failed.')
    if a.target=='windows':
        exe=out/'windows/VeyraNative.exe';exe.parent.mkdir(parents=True,exist_ok=True);exe.unlink(missing_ok=True);run(a.godot,['--export-release','Windows x64'])
        if not exe.exists() or exe.read_bytes()[:2]!=b'MZ':raise RuntimeError('Windows PE executable missing.')
        package=out/'VeyraNative-Windows-x64.zip'
        with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            z.write(exe,'VeyraNative/VeyraNative.exe')
            for name in ['README.md','CREDITS.md']:
                if (ROOT/'native'/name).exists():z.write(ROOT/'native'/name,'VeyraNative/'+name)
        print('WINDOWS_EXPORT_OK',package.name,package.stat().st_size)
    else:
        required=['GODOT_ANDROID_KEYSTORE_RELEASE_PATH','GODOT_ANDROID_KEYSTORE_RELEASE_USER','GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD']
        if not all(os.environ.get(k) for k in required):raise SystemExit('Release signing environment is required. No private keys belong in source.')
        for arch,preset in [('arm64','Android ARM64'),('armv7','Android ARMv7')]:
            file=out/f'VeyraNative-Android-{arch}.apk';file.unlink(missing_ok=True);run(a.godot,['--export-release',preset])
            with zipfile.ZipFile(file) as z:
                names=z.namelist();abi='arm64-v8a' if arch=='arm64' else 'armeabi-v7a'
                if not any(n.startswith('lib/'+abi+'/') and 'godot' in n for n in names):raise RuntimeError('Real native Godot library missing from APK.')
                if 'AndroidManifest.xml' not in names:raise RuntimeError('APK manifest missing.')
            print('ANDROID_EXPORT_OK',file.name,file.stat().st_size)
    records=[]
    for f in sorted(out.glob('*.apk'))+sorted(out.glob('*.zip')):records.append(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name)
    (out/'SHA256SUMS.txt').write_text('\n'.join(records)+'\n')
