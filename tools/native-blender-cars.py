#!/usr/bin/env python3
"""Model real vehicle GLBs with Blender (headless). Original geometry, not placeholder boxes.

Run: blender --background --python tools/native-blender-cars.py -- --out native/assets/cars
Mesh names follow native/scripts/vehicle.gd material routing:
  glass*/window*/windshield* -> glass, tail*/brake* -> taillight, head*/lamp* -> headlight,
  rubber*/wheel* -> rubber (spins), trim*/bumper* -> chrome, everything else -> paint.
Cars are modeled along +X (length), Y up, real metres matching district.json sizes,
so vehicle.gd's visual.scale stays ~1 and proportions survive.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
OUT = 'native/assets/cars'
for i,a in enumerate(argv):
    if a.startswith('--out='): OUT = a.split('=',1)[1]

def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for b in list(block):
            if b.users == 0: block.remove(b)

def mat(name, rgba, metallic=0.0, rough=0.6):
    m = bpy.data.materials.get(name)
    if m: return name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    return name

M_PAINT, M_GLASS, M_RUBBER, M_TRIM, M_HEAD, M_TAIL, M_DARK = 'paint','glass','rubber','trim','head','tail','dark'

def setup_mats():
    mat('paint', (0.75,0.75,0.78,1), 0.2, 0.45)
    mat('glass', (0.05,0.08,0.10,1), 0.1, 0.12)
    mat('rubber', (0.04,0.04,0.045,1), 0.0, 0.9)
    mat('trim', (0.55,0.57,0.60,1), 0.9, 0.3)
    mat('head', (1.0,0.95,0.75,1), 0.0, 0.25)
    mat('tail', (0.55,0.05,0.04,1), 0.0, 0.3)
    mat('dark', (0.10,0.10,0.11,1), 0.2, 0.7)

def finish(obj, name, material, smooth=True):
    obj.name = name
    for p in obj.data.polygons: p.use_smooth = smooth
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials[material])
    return obj

def bevel(obj, width=0.04, segments=2):
    b = obj.modifiers.new('Bevel', 'BEVEL')
    b.width = width; b.segments = segments; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(35)
    b.use_clamp_overlap = True
    return obj

def box(name, size, loc, material, bevel_w=0.025, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = (size[0]/2, size[1]/2, size[2]/2)
    bpy.ops.object.transform_apply(scale=True)
    finish(o, name, material)
    if bevel_w: bevel(o, bevel_w)
    return o

def cyl(name, radius, depth, loc, material, rot=(math.pi/2,0,0), verts=20, bevel_w=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    finish(o, name, material)
    if bevel_w: bevel(o, bevel_w, 1)
    return o

def profile_solid(name, pts, width, material, bevel_w=0.03):
    """Author a clean side profile (x right, y up) and solidify across Z.
    Solidify keeps normals consistent (raw prism + bevel makes balloon flaps)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    bm.faces.new(verts)
    bm.normal_update()
    bm.to_mesh(mesh); bm.free()
    sol = obj.modifiers.new('Solid', 'SOLIDIFY')
    sol.thickness = width
    sol.offset = 0.0
    sol.use_even_offset = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=sol.name)
    obj.select_set(False)
    finish(obj, name, material, smooth=False)
    if bevel_w: bevel(obj, bevel_w)
    return obj

def arch_cut(body, x, radius, width):
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=radius, depth=width, location=(x, radius*0.72, 0), rotation=(math.pi/2,0,0))
    cut = bpy.context.active_object
    mod = body.modifiers.new('Arch', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.object = cut; mod.solver = 'FAST'
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cut, do_unlink=True)

def wheels(L, W, radius, tw, front_x, rear_x, kind_front='wheel_front', kind_rear='wheel_rear'):
    out = []
    for side, sfx in ((-1, 'l'), (1, 'r')):
        for x, tag in ((front_x, kind_front), (rear_x, kind_rear)):
            z = side*(W/2 - tw*0.30)
            tyre = cyl(f'{tag}_{sfx}', radius, tw, (x, radius*0.72, z), M_RUBBER, verts=22)
            out.append(tyre)
            rim = cyl(f'trim_rim_{tag[5:]}_{sfx}', radius*0.58, tw*1.04, (x, radius*0.72, z), M_TRIM, verts=14)
            out.append(rim)
    return out

def lightbar(name, L, W, H, y):
    box(f'taillight_bar_{name}', (0.30, 0.10, W*0.62), (L*0.52, y, 0), M_TAIL, 0.02)
    box(f'headlight_bar_{name}', (0.24, 0.09, W*0.30), (L*0.52, y+0.001, W*0.17), M_HEAD, 0.02)

def mirrors(L, W, y):
    for side, sfx in ((-1,'l'), (1,'r')):
        box(f'trim_mirror_{sfx}', (0.16, 0.10, 0.22), (L*0.34, y, side*(W/2+0.10)), M_DARK, 0.02)

def headlights(L, W, y, size=(0.10,0.14,0.34)):
    for side, sfx in ((-1,'l'), (1,'r')):
        box(f'headlight_{sfx}', size, (L*0.005, y, side*(W*0.30)), M_HEAD, 0.02)
        box(f'taillight_{sfx}', (0.09, 0.15, size[2]*0.9), (L*0.995, y+0.02, side*(W*0.30)), M_TAIL, 0.02)

# ---------- style builders ----------
# Silhouettes are authored in metres: x is 0..L via normalised profile, y is height above ground.

def build_sedan(L, W, H, sporty=False, suv=False):
    if sporty:
        H = min(H, 1.24)
        pts = [(0.00,0.34),(0.03,0.50),(0.14,0.62),(0.30,0.70),
               (0.38,0.88),(0.48,1.06),(0.56,1.14),
               (0.70,1.13),(0.82,0.98),(0.92,0.86),(1.00,0.76),
               (1.00,0.42),(0.96,0.32),(0.03,0.32)]
        wb = 0.415
        ws = ((0.38,0.88),(0.52,1.10)); rr = ((0.70,1.12),(0.86,0.92))
        glass_y = 0.96; glass_h = 0.34
    elif suv:
        H = max(H, 1.72)
        pts = [(0.00,0.50),(0.03,0.72),(0.16,0.88),(0.30,0.94),
               (0.36,1.22),(0.42,1.52),(0.48,1.68),
               (0.82,1.70),(0.88,1.64),(0.92,1.38),
               (1.00,1.30),(1.00,0.62),(0.96,0.48),(0.03,0.48)]
        wb = 0.475
        ws = ((0.36,1.22),(0.50,1.62)); rr = ((0.82,1.62),(0.92,1.38))
        glass_y = 1.36; glass_h = 0.52
    else:
        H = max(H, 1.44)
        pts = [(0.00,0.42),(0.02,0.62),(0.10,0.78),
               (0.22,0.88),(0.34,0.92),
               (0.40,1.12),(0.46,1.36),(0.52,1.43),
               (0.66,1.44),
               (0.76,1.36),(0.82,1.12),
               (0.90,1.02),(0.96,0.98),
               (1.00,0.86),(1.00,0.52),(0.97,0.40),(0.03,0.40)]
        wb = 0.415
        ws = ((0.41,1.12),(0.53,1.40)); rr = ((0.74,1.36),(0.87,1.10))
        glass_y = 1.18; glass_h = 0.40
    body = profile_solid('body_main', [(x*L, y) for x,y in pts], W, M_PAINT, 0.032)
    # windshields follow the pillar slopes
    ws_ang = math.atan2(ws[1][1]-ws[0][1], (ws[1][0]-ws[0][0])*L)
    box('glass_windshield', (0.05, math.hypot((ws[1][1]-ws[0][1]), (ws[1][0]-ws[0][0])*L)*0.92, W*0.84),
        (L*(ws[0][0]+ws[1][0])/2, (ws[0][1]+ws[1][1])/2, 0), M_GLASS, 0.012, rot=(0, 0, ws_ang))
    rr_ang = math.atan2(rr[1][1]-rr[0][1], (rr[1][0]-rr[0][0])*L)
    box('glass_rear', (0.05, math.hypot((rr[1][1]-rr[0][1]), (rr[1][0]-rr[0][0])*L)*0.92, W*0.80),
        (L*(rr[0][0]+rr[1][0])/2, (rr[0][1]+rr[1][1])/2, 0), M_GLASS, 0.012, rot=(0, 0, rr_ang))
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'glass_side_{sfx}', (L*(0.30 if not suv else 0.38), glass_h, 0.05),
            (L*0.60, glass_y, side*(W/2-0.015)), M_GLASS, 0.012)
        box(f'trim_line_{sfx}', (L*0.30, 0.012, 0.02), (L*0.58, glass_y-0.30, side*(W/2+0.004)), M_DARK, 0)
    box('body_bumper_front', (0.24, 0.20, W*0.90), (L*0.025, 0.48 if not sporty else 0.38, 0), M_PAINT, 0.03)
    box('body_bumper_rear', (0.22, 0.20, W*0.90), (L*0.975, 0.50 if not sporty else 0.40, 0), M_PAINT, 0.03)
    box('trim_grille', (0.07, 0.18, W*0.50), (L*0.012, 0.66 if not sporty else 0.52, 0), M_DARK, 0.015)
    hy = 0.78 if not suv else 0.94
    if sporty: hy = 0.58
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'headlight_{sfx}', (0.10, 0.13, 0.36), (L*0.01, hy, side*(W*0.30)), M_HEAD, 0.02)
        box(f'taillight_{sfx}', (0.09, 0.16, 0.34), (L*0.99, hy+0.12, side*(W*0.30)), M_TAIL, 0.02)
        box(f'trim_mirror_{sfx}', (0.16, 0.10, 0.20), (L*0.38, glass_y+0.10, side*(W/2+0.11)), M_DARK, 0.02)
    box('trim_exhaust', (0.10, 0.08, 0.16), (L*1.005, 0.34, W*0.26), M_TRIM, 0.015)
    if suv:
        for side, sfx in ((-1,'l'),(1,'r')):
            box(f'trim_rail_{sfx}', (L*0.36, 0.07, 0.09), (L*0.62, 1.78, side*W*0.30), M_TRIM, 0.02)
    if sporty:
        box('body_spoiler', (0.32, 0.05, W*0.88), (L*0.90, 0.98, 0), M_PAINT, 0.02)
        for side, sfx in ((-1,'l'),(1,'r')):
            box(f'trim_stay_{sfx}', (0.07, 0.18, 0.05), (L*0.90, 0.88, side*W*0.28), M_TRIM, 0.012)
    f_x, r_x = L*0.22, L*0.80
    wheels(L, W, wb, min(0.32, W*0.155), f_x, r_x)

def build_pickup(L, W, H):
    H = max(H, 1.70)
    wb = 0.485
    pts = [(0.00,0.50),(0.03,0.74),(0.16,0.90),(0.28,0.96),
           (0.34,1.26),(0.40,1.56),(0.48,1.70),(0.58,1.70),
           (0.63,1.28),(0.65,1.12),(0.97,1.12),(1.00,1.08),
           (1.00,0.56),(0.96,0.46),(0.03,0.46)]
    body = profile_solid('body_main', [(x*L, y) for x,y in pts], W, M_PAINT, 0.032)
    box('body_bedfloor', (L*0.30, 0.06, W*0.88), (L*0.81, 1.06, 0), M_DARK, 0.02)
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'body_bedwall_{sfx}', (L*0.30, 0.30, 0.09), (L*0.81, 1.22, side*W*0.43), M_PAINT, 0.02)
    box('body_tailgate', (0.09, 0.34, W*0.86), (L*0.985, 1.22, 0), M_PAINT, 0.02)
    box('glass_windshield', (0.05, 0.56, W*0.84), (L*0.375, 1.34, 0), M_GLASS, 0.012, rot=(0, 0, math.atan2(0.44, L*0.06)))
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'glass_side_{sfx}', (L*0.18, 0.46, 0.05), (L*0.50, 1.36, side*(W/2-0.015)), M_GLASS, 0.012)
        box(f'trim_mirror_{sfx}', (0.16, 0.10, 0.20), (L*0.36, 1.48, side*(W/2+0.11)), M_DARK, 0.02)
    box('glass_rear', (0.05, 0.42, W*0.72), (L*0.625, 1.38, 0), M_GLASS, 0.012, rot=(0, 0, -0.28))
    box('body_bumper_front', (0.26, 0.26, W*0.92), (L*0.02, 0.56, 0), M_PAINT, 0.03)
    box('body_bumper_rear', (0.22, 0.24, W*0.92), (L*0.985, 0.58, 0), M_PAINT, 0.03)
    box('trim_grille', (0.08, 0.24, W*0.52), (L*0.012, 0.80, 0), M_DARK, 0.015)
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'headlight_{sfx}', (0.11, 0.16, 0.38), (L*0.012, 0.88, side*(W*0.30)), M_HEAD, 0.02)
        box(f'taillight_{sfx}', (0.09, 0.18, 0.34), (L*0.995, 1.16, side*(W*0.32)), M_TAIL, 0.02)
    f_x, r_x = L*0.22, L*0.80
    wheels(L, W, wb, min(0.34, W*0.16), f_x, r_x)

def build_box(L, W, H, style='van', ladder=False, lightbar_y=None, ribbed=True):
    H = max(H, 2.15)
    wb = 0.42 if H < 2.5 else 0.50
    sh = H/2.35
    pts = [(0.00,0.42),(0.015,1.02*sh+0.2),(0.05,1.30*sh),(0.11,1.42*sh),
           (0.94,1.44*sh),(1.00,1.36*sh),(1.00,0.48),(0.96,0.38),(0.03,0.38)]
    body = profile_solid('body_main', [(x*L, y) for x,y in pts], W, M_PAINT, 0.03)
    box('glass_windshield', (0.05, 0.62, W*0.86), (L*0.095, 1.12*sh, 0), M_GLASS, 0.012, rot=(0, 0, math.atan2(0.34*sh, L*0.06)))
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'glass_side_{sfx}', (L*0.11, 0.46, 0.05), (L*0.175, 1.12*sh, side*(W/2-0.015)), M_GLASS, 0.012)
        box(f'trim_mirror_{sfx}', (0.18, 0.11, 0.22), (L*0.10, 1.22*sh, side*(W/2+0.12)), M_DARK, 0.02)
        if ribbed:
            for i in range(4):
                box(f'trim_rib_{sfx}_{i}', (0.07, 1.05*sh, 0.035), (L*(0.34+i*0.155), 0.88*sh, side*(W/2+0.012)), M_TRIM, 0.01)
    box('glass_rear', (0.05, 0.85, W*0.82), (L*0.985, 0.98*sh, 0), M_GLASS, 0.012)
    box('body_bumper_front', (0.24, 0.28, W*0.94), (L*0.018, 0.50, 0), M_PAINT, 0.03)
    box('body_bumper_rear', (0.20, 0.26, W*0.94), (L*0.988, 0.52, 0), M_PAINT, 0.03)
    box('trim_grille', (0.08, 0.26, W*0.50), (L*0.01, 0.68, 0), M_DARK, 0.015)
    for side, sfx in ((-1,'l'),(1,'r')):
        box(f'headlight_{sfx}', (0.11, 0.19, 0.40), (L*0.012, 0.80, side*(W*0.30)), M_HEAD, 0.02)
        box(f'taillight_{sfx}', (0.09, 0.22, 0.36), (L*0.995, 0.88, side*(W*0.31)), M_TAIL, 0.02)
    if ladder:
        for side, sfx in ((-1,'l'),(1,'r')):
            box(f'trim_ladder_{sfx}', (0.07, 1.25*sh, 0.11), (L*0.74, 1.05*sh, side*(W/2+0.09)), M_TRIM, 0.015)
        box('trim_ladder_top', (0.55, 0.07, 0.13), (L*0.74, 1.72*sh, 0), M_TRIM, 0.015)
    if lightbar_y:
        lightbar('box', L, W, H, lightbar_y)
    f_x, r_x = L*0.16, L*0.78
    wheels(L, W, wb, min(0.36, W*0.155), f_x, r_x)

def build_motorbike(L, W, H):
    r = L*0.16
    fx, rx = L*0.20, L*0.82
    wheels(L, W*0.30, r, W*0.28, fx, rx, 'wheel_front', 'wheel_rear')
    box('body_frame', (L*0.52, 0.16, W*0.34), (L*0.50, r*1.55, 0), M_PAINT, 0.03, rot=(0,0,0.05))
    box('body_tank', (L*0.22, 0.22, W*0.42), (L*0.42, r*1.85, 0), M_PAINT, 0.05)
    box('body_seat', (L*0.30, 0.12, W*0.38), (L*0.62, r*1.95, 0), M_DARK, 0.04)
    cyl('trim_fork', 0.035, r*1.7, (L*0.20, r*1.15, 0), M_TRIM, rot=(0, math.radians(22), 0), verts=10)
    box('trim_handle', (0.06, 0.06, W*0.62), (L*0.26, r*2.35, 0), M_TRIM, 0.02)
    box('headlight_front', (0.08, 0.16, W*0.34), (L*0.17, r*2.05, 0), M_HEAD, 0.02)
    box('taillight_rear', (0.07, 0.12, W*0.28), (L*0.92, r*1.85, 0), M_TAIL, 0.02)
    box('glass_windshield', (0.04, 0.18, W*0.30), (L*0.22, r*2.55, 0), M_GLASS, 0.01, rot=(0,-0.3,0))

def build_kart(L, W, H):
    r = 0.17
    wheels(L, W*0.9, r, 0.14, L*0.22, L*0.80)
    box('body_main', (L*0.62, 0.10, W*0.62), (L*0.50, r*1.35, 0), M_PAINT, 0.03)
    box('body_seat', (L*0.18, 0.28, W*0.34), (L*0.62, r*1.6, 0), M_DARK, 0.04)
    box('trim_handle', (0.05, 0.05, W*0.42), (L*0.34, r*1.9, 0), M_TRIM, 0.02)
    box('body_fairing', (L*0.14, 0.16, W*0.5), (L*0.18, r*1.5, 0), M_PAINT, 0.03)
    box('headlight_front', (0.05, 0.08, W*0.3), (L*0.12, r*1.55, 0), M_HEAD, 0.015)

def build_tractor(L, W, H):
    rr = 0.62; fr = 0.34
    wheels(L, W, rr, 0.36, L*0.28, L*0.76, 'wheel_front', 'wheel_rear')
    box('body_main', (L*0.34, 0.5, W*0.52), (L*0.42, rr*1.35, 0), M_PAINT, 0.05)
    box('body_cabin', (L*0.26, 0.7, W*0.62), (L*0.58, rr*1.85, 0), M_PAINT, 0.05)
    box('glass_cabin', (L*0.22, 0.5, W*0.64), (L*0.58, rr*1.90, 0), M_GLASS, 0.02)
    box('body_hood', (L*0.22, 0.3, W*0.4), (L*0.22, rr*1.25, 0), M_PAINT, 0.05)
    box('trim_exhaust', (0.08, 0.55, 0.08), (L*0.30, rr*1.85, W*0.18), M_TRIM, 0.02)
    box('headlight_front', (0.08, 0.14, 0.3), (L*0.08, rr*1.45, 0), M_HEAD, 0.02)
    box('taillight_rear', (0.08, 0.14, 0.3), (L*0.88, rr*1.25, 0), M_TAIL, 0.02)

def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # safety: drop default-named leftovers that would corrupt bounds
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] in ('Cube','Cylinder','Sphere','Plane'):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects: print('BLEND_OBJ', o.name, len(o.data.vertices) if o.type=='MESH' else '-')
    # Builders author in Y-up math; Blender is Z-up. Rotate +90 about X so export_yup keeps axes right.
    from mathutils import Matrix
    rot = Matrix.Rotation(math.pi/2, 4, 'X')
    for o in bpy.data.objects:
        o.matrix_world = rot @ o.matrix_world
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True)
    print('BLEND_EXPORT', path, os.path.getsize(path))

def go(kind, L, W, H, builder, **kw):
    clean()
    setup_mats()
    builder(L, W, H, **kw)
    export(os.path.join(OUT, kind + '.glb'))

go('sedan', 4.6, 2.08, 1.45, build_sedan)
go('sport', 4.8, 2.06, 1.22, build_sedan, sporty=True)
go('suv', 5.0, 2.14, 1.78, build_sedan, suv=True)
go('suv-luxury', 5.3, 2.16, 1.72, build_sedan, suv=True)
go('taxi', 4.8, 2.08, 1.46, build_sedan)
go('police', 4.8, 2.1, 1.44, build_sedan)
go('pickup', 6.0, 2.3, 1.78, build_pickup)
go('van', 5.5, 2.6, 2.25, build_box)
go('bus', 8.6, 2.8, 3.05, build_box, ribbed=True)
go('ambulance', 6.2, 2.6, 2.55, build_box, lightbar_y=2.75)
go('firetruck', 6.8, 2.9, 2.85, build_box, ladder=True, lightbar_y=3.05)
go('garbage-truck', 7.0, 3.0, 2.9, build_box, ribbed=True)
go('delivery', 6.0, 2.7, 2.45, build_box, ribbed=False)
go('race', 4.7, 2.02, 1.15, build_sedan, sporty=True)
go('kart-ooli', 3.0, 1.8, 0.75, build_kart)
go('tractor', 5.4, 2.7, 2.2, build_tractor)
go('tractor-shovel', 5.8, 3.0, 2.4, build_tractor)
go('motorbike', 2.8, 1.2, 1.25, build_motorbike)
print('BLEND_ALL_DONE')
