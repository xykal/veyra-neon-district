#!/usr/bin/env python3
"""Model streetwear accessory GLBs for the avatar rig (Blender headless).

Run: blender --background --python tools/native-blender-fashion.py -- --out native/assets/people
Pieces are modelled at the bone attachment origin so avatar.gd keeps its offsets.
"""
import bpy, bmesh, math, sys, os
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
OUT = 'native/assets/people'
for a in argv:
    if a.startswith('--out='): OUT = a.split('=',1)[1]

def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for b in list(block):
            if b.users == 0: block.remove(b)

def mat(name, rgba, metallic=0.0, rough=0.7):
    m = bpy.data.materials.get(name)
    if m: return name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = rgba
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    return name

def finish(obj, name, material, smooth=True):
    obj.name = name
    for p in obj.data.polygons: p.use_smooth = smooth
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials[material])
    return obj

def bevel(obj, w=0.015, seg=2):
    b = obj.modifiers.new('Bevel','BEVEL'); b.width=w; b.segments=seg
    b.limit_method='ANGLE'; b.angle_limit=math.radians(40); b.use_clamp_overlap=True

def box(name, size, loc, material, rot=(0,0,0), bw=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale=(size[0]/2,size[1]/2,size[2]/2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o,name,material,smooth=False)
    if bw: bevel(o,bw)
    return o

def sphere(name, radius, loc, material, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=radius, location=loc)
    o=bpy.context.active_object; o.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o,name,material)
    return o

def cyl(name, radius, depth, loc, material, rot=(0,0,0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o=bpy.context.active_object
    finish(o,name,material)
    return o

def torus(name, major, minor, loc, material, scale=(1,1,1), rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=18, minor_segments=8)
    o=bpy.context.active_object; o.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o,name,material)
    return o

def export(path):
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] in ('Cube','Cylinder','Sphere','Plane','Torus'):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format='GLB',
                              use_selection=True, export_yup=True, export_apply=False)
    print('FASHION_EXPORT', path, os.path.getsize(path))

FABRIC='fabric'; DENIM='denim'; METAL='metal'; SKIN='skin'

def go(name, fn):
    clean()
    mat(FABRIC,(0.16,0.17,0.19,1),0.0,0.88)
    mat(DENIM,(0.12,0.17,0.26,1),0.0,0.82)
    mat(METAL,(0.85,0.72,0.38,1),0.95,0.3)
    mat(SKIN,(0.85,0.68,0.52,1),0.0,0.9)
    fn()
    export(os.path.join(OUT,'wear_'+name+'.glb'))

def cap():
    # crown sits on head; FRONT = Blender -Y
    sphere('cap_crown',0.148,(0,0.012,-0.012),FABRIC,scale=(1.0,1.0,0.82))
    sphere('cap_button',0.02,(0,0.012,0.118),FABRIC)
    brim=box('cap_brim',(0.235,0.155,0.022),(0,-0.168,-0.028),FABRIC,bw=0.012)
    brim.rotation_euler=(math.radians(-14),0,0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    torus('cap_band',0.132,0.016,(0,0.012,-0.028),FABRIC,scale=(1.06,1.06,1))

def hood():
    # behind the head/neck: +Y is back
    torus('hood_roll',0.155,0.052,(0,0.075,-0.075),FABRIC,scale=(1.12,0.85,1.0))
    sphere('hood_back',0.15,(0,0.135,-0.145),FABRIC,scale=(1.1,1.05,0.72))

def bag():
    box('bag_body',(0.30,0.115,0.215),(0,0,0),DENIM,bw=0.028)
    box('bag_flap',(0.30,0.02,0.115),(0,-0.062,0.055),DENIM,rot=(math.radians(12),0,0),bw=0.012)
    box('bag_strap_l',(0.05,0.02,0.16),(-0.10,0.075,0.02),DENIM,rot=(math.radians(12),0,0),bw=0.008)
    box('bag_strap_r',(0.05,0.02,0.16),(0.10,0.075,0.02),DENIM,rot=(math.radians(12),0,0),bw=0.008)
    box('bag_handle',(0.10,0.025,0.035),(0,0.115,0.0),DENIM,bw=0.008)
    box('bag_buckle',(0.045,0.016,0.038),(0,-0.078,0.02),METAL,bw=0.006)

def pocket():
    box('pocket_body',(0.155,0.055,0.17),(0,0,0),DENIM,bw=0.018)
    box('pocket_flap',(0.155,0.018,0.075),(0,-0.032,0.075),FABRIC,rot=(math.radians(10),0,0),bw=0.008)
    box('pocket_pleat',(0.045,0.02,0.12),(0,-0.032,-0.015),FABRIC,bw=0.006)

def chain():
    # chest drape at FRONT (-Y), hanging down
    for i in range(5):
        torus(f'chain_link_{i}',0.03,0.0075,(0.016*i-0.032,-0.128-0.012*abs(i-2),0.085-0.055*i),METAL,
              scale=(1,1,0.55),rot=(math.radians(75),0,math.radians(18*(i-2))))

def jacket():
    # hoodie shell: FRONT flap at -Y, hood roll at +Y (back)
    box('jacket_torso',(0.42,0.24,0.50),(0,0,0),FABRIC,bw=0.05)
    box('jacket_flap',(0.30,0.02,0.34),(0,-0.13,0.02),DENIM,bw=0.02)
    box('jacket_hem',(0.42,0.25,0.07),(0,0,-0.26),DENIM,bw=0.02)
    torus('jacket_hoodroll',0.15,0.048,(0,0.10,0.22),FABRIC,scale=(1.1,1,0.85))

go('cap',cap)
go('hood',hood)
go('bag',bag)
go('pocket',pocket)
go('chain',chain)
go('jacket',jacket)
print('FASHION_ALL_DONE')
