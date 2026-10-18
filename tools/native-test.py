#!/usr/bin/env python3
"""Finite headless native engine tests; Godot errors/absent PASS markers fail even if engine exits 0."""
import argparse,os,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def execute(godot,args,marker,env=None,timeout=90):
    r=subprocess.run([str(godot),'--headless','--audio-driver','Dummy','--path',str(ROOT/'native'),*args],cwd=ROOT,env=env,capture_output=True,text=True,timeout=timeout)
    text=r.stdout+r.stderr
    errors=[line for line in text.splitlines() if 'ERROR:' in line or 'SCRIPT ERROR' in line]
    print('\n'.join(line for line in text.splitlines() if 'PASS' in line or 'FAIL' in line or 'ERROR' in line or 'READY' in line))
    if r.returncode or errors or marker not in text:
        print(text[-10000:]);raise RuntimeError('Native validation failed: '+marker)
    return text
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--godot',type=Path,default=os.environ.get('GODOT_BIN'));p.add_argument('--skip-network',action='store_true');a=p.parse_args()
    if not a.godot:raise SystemExit('Set GODOT_BIN or pass --godot.')
    r=subprocess.run([str(a.godot),'--headless','--editor','--path',str(ROOT/'native'),'--import'],capture_output=True,text=True,timeout=180)
    if r.returncode or 'SCRIPT ERROR' in r.stdout+r.stderr:print((r.stdout+r.stderr)[-8000:]);raise SystemExit('Native import/parse failed.')
    execute(a.godot,['--fixed-fps','60','--script','res://tests/avatar_smoke.gd'],'AVATAR_SMOKE_PASS')
    execute(a.godot,['--fixed-fps','60','--script','res://tests/physics_smoke.gd'],'NATIVE_PHYSICS_PASS')
    execute(a.godot,['--fixed-fps','60','--script','res://tests/driver_smoke.gd'],'NATIVE_DRIVER_PASS')
    execute(a.godot,['--fixed-fps','60','--quit-after','900','--','--smoke-test'],'NATIVE_APP_SMOKE_PASS')
    if not a.skip_network:
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        with tempfile.TemporaryDirectory(prefix='veyra-native-test-') as directory:
            env=os.environ.copy();env.update(PORT=str(port),DATA_DIR=directory)
            with (Path(directory)/'server.log').open('w') as log:
                server=subprocess.Popen(['node','server/index.js'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
                try:
                    ready=False
                    for _ in range(100):
                        try:
                            with urllib.request.urlopen(f'http://127.0.0.1:{port}/healthz',timeout=.5) as r:ready=r.status==200
                            if ready:break
                        except Exception:time.sleep(.1)
                    if not ready:raise RuntimeError('Local authoritative server did not start.')
                    env=os.environ.copy();env['VEYRA_TEST_SERVER']=f'ws://127.0.0.1:{port}/'
                    execute(a.godot,['--script','res://tests/network_pair.gd'],'NATIVE_NETWORK_PASS',env=env,timeout=45)
                finally:
                    server.terminate()
                    try:server.wait(timeout=10)
                    except subprocess.TimeoutExpired:server.kill();server.wait()
    print('NATIVE_SUITE_PASS: artist rig + physical ragdoll + controller/vehicle + app boot + native multiplayer')
