#!/usr/bin/env python3
"""Veyra Native — skinned garments (GTA-V/FiveM style).

FINAL DESIGN: garments are DERIVED FROM BODY VERTS (region subset + inflate).
Weights ride along automatically — no weight copying, cannot break skinning.
Run: blender --background --python native-blender-garments.py -- --in=a.glb --out=a.glb
"""
import sys, os

def dbg(msg):
    open('/tmp/mine/gbuild-'+os.path.basename(ARG('out','x'))+'.log','a').write(msg+chr(10))

import bpy
import bmesh
from mathutils import Vector

def ARG(key, default=None):
    for a in sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []:
        if a.startswith("--" + key + "="):
            return a.split("=", 1)[1]
    for i, a in enumerate(sys.argv):
        if a == "--" + key and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default

def clean_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.armatures):
        for b in list(blk):
            blk.remove(b)

def import_rig():
    glb = ARG("in")
    if not glb:
        sys.exit("--in required")
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb))
    arm = None
    body = None
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            arm = o
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == arm:
            if body is None or len(o.data.vertices) > len(body.data.vertices):
                body = o
    print('RIG', arm.name if arm else None, 'BODY', body.name if body else None,
          'BODY_VERTS', len(body.data.vertices) if body else 0)
    return body, arm

def mat(name, rgba, rough=0.85, metal=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = rgba
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
    return m

def _smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True

def body_region(body, name, bone_prefixes, inflate, material, thickness=0.010):
    """Garment = body verts whose dominant bone matches, inflated along normals."""
    ob = body.copy()
    ob.data = body.data.copy()
    ob.name = ob.data.name = name
    for suf in ('.001', '.002', '.003', '.004', '.005', '.006'):
        while ob.name.endswith(suf):
            ob.name = ob.name[:-len(suf)]
            ob.data.name = ob.name
    bpy.context.collection.objects.link(ob)
    dg = ob.data
    vgroups = {vg.index: vg.name for vg in ob.vertex_groups}
    bone_of = []
    for v in dg.vertices:
        best, bw = None, -1.0
        for g in v.groups:
            if g.weight > bw:
                bw = g.weight
                best = vgroups.get(g.group, "")
        bone_of.append(best or "")
    bm = bmesh.new(); bm.from_mesh(dg)
    bm.verts.ensure_lookup_table()
    kill = [v for i, v in enumerate(bm.verts)
            if not any((bone_of[i] or "").startswith(px) for px in bone_prefixes)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.verts.ensure_lookup_table()
    from mathutils import Matrix
    cen = Vector((0, 0, 0))
    for v in bm.verts:
        cen += v.co
    if len(bm.verts):
        cen /= len(bm.verts)
    for v in bm.verts:
        n = v.normal.copy()
        if n.length < 1e-6:
            n = Vector((0, 1, 0))
        radial = v.co - cen
        if radial.length > 1e-4 and n.dot(radial) < 0:
            n = -n
        v.co += n * inflate
    bm.to_mesh(dg)
    bm.free()
    if len(dg.vertices) < 8:
        bpy.data.objects.remove(ob, do_unlink=True)
        print("REGION %-10s SKIPPED empty" % name)
        return None
    solid = ob.modifiers.new("Solid", 'SOLIDIFY')
    solid.thickness = thickness; solid.offset = 0.0
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solid.name)
    ob.select_set(False)
    if 200 <= len(dg.vertices) <= 3500:
        sub = ob.modifiers.new("Sub", 'SUBSURF')
        sub.levels = 1; sub.render_levels = 1
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier=sub.name)
        ob.select_set(False)
    dg.materials.clear()
    dg.materials.append(material)
    _smooth(ob)
    print("REGION %-10s verts=%d" % (ob.name, len(dg.vertices)))
    return ob

def set_anim_clean(arm):
    for act in list(bpy.data.actions):
        n = act.name
        for suf in ('_Armature.001', '_Armature', '__', '.001'):
            while n.endswith(suf):
                n = n[:-len(suf)]
        act.name = n
    if arm and arm.animation_data and arm.animation_data.action:
        arm.animation_data.action = arm.animation_data.action

def export_glb(out, meshes, arm):
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    if arm:
        arm.select_set(True)
    bpy.context.view_layer.objects.active = arm or (meshes[0] if meshes else None)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB',
                              use_selection=True, export_yup=True, export_apply=False,
                              export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_def_bones=True)
    print('GARMENTS_EXPORT', out)

def build():
    clean_scene()
    body, arm = import_rig()
    if body is None or arm is None:
        print('GARMENTS_FAIL no rig'); return False
    # KEEP the quaternius outfit meshes (already perfectly skinned) — just re-style them.
    fabric = mat('Fabric', (0.16, 0.30, 0.22, 1), 0.88)
    tee = mat('Tee', (0.22, 0.22, 0.24, 1), 0.85)
    denim = mat('Denim', (0.08, 0.09, 0.12, 1), 0.85)
    leather = mat('Leather', (0.14, 0.09, 0.06, 1), 0.55)
    for o in list(bpy.data.objects):
        if o.type in ('CAMERA', 'LIGHT') or o.name.split('.')[0] in ('Cube',):
            print("DROP stray", o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.split('.')[0] in ('HoodShell', 'TailShell'):
            print("DROP", o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    style = {"TopLong": (fabric, 0.0), "TopShort": (tee, 0.0),
             "PantsLong": (denim, 0.0), "PantsShort": (denim, 0.0),
             "Boots": (leather, 0.0)}
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            continue
        key = o.name.split('.')[0]
        if key in style:
            mmat, infl = style[key]
            bm = bmesh.new(); bm.from_mesh(o.data)
            bm.verts.ensure_lookup_table()
            # smooth away inflation waviness, then tighten slightly along normals
            if ARG('pristine'):
                pass
            else:
                for _ in range(2):
                    bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.45,
                                          use_axis_x=True, use_axis_y=True, use_axis_z=True)
            bm.normal_update()
            cen = Vector((0, 0, 0))
            for v in bm.verts: cen += v.co
            if len(bm.verts): cen /= len(bm.verts)
            for v in bm.verts:
                n = v.normal.copy()
                if n.length < 1e-6: n = Vector((0, 1, 0))
                radial = v.co - cen
                if radial.length > 1e-4 and n.dot(radial) < 0: n = -n
                v.co += n * (0.008 if ARG('pristine') else (infl - 0.012))
            bm.to_mesh(o.data); bm.free()
            o.data.materials.clear()
            o.data.materials.append(mmat)
            _smooth(o)
            print("STYLE %-10s verts=%d" % (o.name, len(o.data.vertices)))
    set_anim_clean(arm)
    export_glb(ARG("out", ARG("in")), [o for o in bpy.data.objects if o.type == 'MESH'], arm)
    dbg('done')
    return True

if __name__ == "__main__":
    build()
