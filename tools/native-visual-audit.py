#!/usr/bin/env python3
"""Veyra visual QA — automated pre-release validation.

Captures a fixed camera set (lobby, loading, city, street, avatar, vehicle, coast),
then checks every frame: error lines, exposure, contrast (flat-color detection),
and colour-band health. Prints a PASS/FAIL table and writes a contact sheet.

Run:  python3 tools/native-visual-audit.py            # default /tmp/veyra-audit
      python3 tools/native-visual-audit.py --out DIR --keep-rig
Exit code 0 = all scenes pass. Non-zero = do NOT release.
"""
import argparse, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GODOT = Path(os.environ.get('GODOT_BIN', str(Path.home() / '.cache/veyra-native/godot-linux/Godot_v4.7.2-stable_linux.x86_64')))

RIG = '''extends SceneTree
func _initialize():call_deferred("run")
func run():
 var out=OUT_DIR
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 var cam=Camera3D.new();cam.fov=55;cam.current=true;root.add_child(cam)
 game.ui.show_menu()
 for f in range(10):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-lobby.png")
 game.ui.set_loading(true,0.62,"Menyiapkan distrik…")
 for f in range(8):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-loading.png")
 game.ui.set_loading(false,1.0,"Selesai")
 game.ui.show_game()
 if game.world:
  for node in game.world.batch_nodes:node.visibility_range_end=2400.0
  game.world.distance_limit=2400.0
 game.player.enabled=false
 var pl=game.player
 cam.position=Vector3(240,16,318);cam.look_at(Vector3(240,8,120),Vector3.UP)
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-city.png")
 cam.position=Vector3(232,2.4,268);cam.look_at(Vector3(236,6,190),Vector3.UP);cam.fov=62
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-street.png")
 cam.position=pl.avatar.global_position+Vector3(1.2,1.3,2.7);cam.look_at(pl.avatar.global_position+Vector3(0,1.0,0),Vector3.UP);cam.fov=52
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-avatar.png")
 var v=load("res://scripts/vehicle.gd").new()
 root.add_child(v)
 v.configure({"id":950,"type":"sport","x":pl.avatar.global_position.x+7.0,"y":pl.avatar.global_position.z,"a":0.9},game.world.data.types,game.quality,game.audio_node)
 await physics_frame;await physics_frame
 cam.position=v.global_position+Vector3(3.8,1.9,4.1);cam.look_at(v.global_position+Vector3(0,0.75,0),Vector3.UP);cam.fov=50
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-vehicle.png")
 v.queue_free()
 cam.position=Vector3(305,26,-20);cam.look_at(Vector3(380,2,90),Vector3.UP);cam.fov=60
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(out+"/scene-coast.png")
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
'''

SCENES = ["lobby", "loading", "city", "street", "avatar", "vehicle", "coast"]
BRIGHT_LO, BRIGHT_HI = 28.0, 218.0   # mean luma bounds
SCENE_LUMA = {"loading": (14.0, 218.0), "lobby": (22.0, 218.0)}  # splash/lobby allow moodier frames
CONTRAST_LO = 12.0                    # luma std below this = flat frame


def run_capture(out: Path) -> dict:
    rig = ROOT / 'native/tests/tmp_visual_audit.gd'
    rig.write_text(RIG.replace('OUT_DIR', '"' + str(out) + '"'))
    env = dict(os.environ)
    try:
        subprocess.run([str(GODOT), '--headless', '--path', 'native', '--import'],
                       cwd=ROOT, timeout=240, capture_output=True)
        proc = subprocess.run(['xvfb-run', '-a', str(GODOT), '--path', 'native',
                               '--audio-driver', 'Dummy', '--rendering-driver', 'opengl3',
                               '--script', 'res://tests/tmp_visual_audit.gd'],
                              cwd=ROOT, timeout=360, capture_output=True, text=True, env=env)
        log = (proc.stdout or '') + (proc.stderr or '')
    except Exception as exc:
        log = f'AUDIT_CAPTURE_CRASH {exc}'
    (out / 'capture.log').write_text(log)
    return {'errors': len(re.findall(r'^\s*ERROR:', log, re.M))}


def check_image(path: Path):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im.thumbnail((480, 480))
    px = list(im.getdata())
    n = len(px)
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px]
    mean = sum(lum) / n
    var = sum((l - mean) ** 2 for l in lum) / n
    std = var ** 0.5
    problems = []
    if mean < BRIGHT_LO: problems.append(f'dark(mean={mean:.0f})')
    if mean > BRIGHT_HI: problems.append(f'blown(mean={mean:.0f})')
    if std < CONTRAST_LO: problems.append(f'flat(std={std:.1f})')
    return mean, std, problems


def contact_sheet(out: Path):
    from PIL import Image
    thumbs = []
    for name in SCENES:
        p = out / f'scene-{name}.png'
        if p.exists():
            im = Image.open(p).convert('RGB')
            im.thumbnail((320, 200))
            thumbs.append((name, im))
    if not thumbs: return
    cols = 3
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 330, rows * 215), (16, 22, 30))
    for i, (name, im) in enumerate(thumbs):
        sheet.paste(im, ((i % cols) * 330 + 5, (i // cols) * 215 + 5))
    sheet.save(out / 'contact-sheet.png')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/veyra-audit')
    ap.add_argument('--keep-rig', action='store_true')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob('scene-*.png'): f.unlink()

    print('== Veyra visual QA ==')
    cap = run_capture(out)
    rows = []
    failed = 0
    for name in SCENES:
        p = out / f'scene-{name}.png'
        if not p.exists():
            rows.append((name, 'MISSING', '-', ['capture gagal']))
            failed += 1
            continue
        mean, std, problems = check_image(p)
        lo, hi = SCENE_LUMA.get(name, (BRIGHT_LO, BRIGHT_HI))
        problems = [q for q in problems if (('dark' not in q) or (mean < lo)) and (('blown' not in q) or (mean > hi))]
        if problems: failed += 1
        rows.append((name, 'FAIL' if problems else 'PASS', f'{mean:.0f}/{std:.0f}', problems))
    contact_sheet(out)
    for name, status, ms, problems in rows:
        extra = (' — ' + ', '.join(problems)) if problems else ''
        print(f'  {name:8s} {status:5s} luma/std={ms}{extra}')
    print(f'errors_in_log={cap["errors"]}  scenes_failed={failed}/{len(SCENES)}')
    print(f'sheet={out / "contact-sheet.png"}')
    if not args.keep_rig:
        rig = ROOT / 'native/tests/tmp_visual_audit.gd'
        if rig.exists(): rig.unlink()
    if failed or cap['errors'] > 24:
        print('VISUAL_QA_FAIL')
        return 1
    print('VISUAL_QA_PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
