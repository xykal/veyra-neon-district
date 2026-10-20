extends RefCounted
# City kit — gedung modular Downtown City Megakit (CC0 Quaternius).
const VARIANTS=[
 {"scene":"Building_Small_1","w":12.2,"h":16.0,"d":12.2},
 {"scene":"Building_Medium_2_001","w":14.0,"h":24.0,"d":12.0},
 {"scene":"Building_Large_2","w":20.0,"h":28.0,"d":16.0}]
const BLOCK=80.0
var slices=[]
var mats={}
var pending={}
var active=false
var placed_count=0
func setup(quality):
 active=quality>=1
 if not active or not slices.is_empty():return
 var tc="res://assets/city/"
 mats.brick=_std(tc+"T_RedBrick_BaseColor.png",tc+"T_RedBrick_Normal.png",.82,0.0)
 mats.concrete=_std(tc+"T_Concrete_BaseColor.png",tc+"T_Concrete_Normal.png",.78,0.0)
 mats.metal=_std(tc+"T_MetalConcrete_BaseColor.png",tc+"T_MetalConcrete_Normal.png",.5,.35)
 mats.trim=_std(tc+"T_Trim_BaseColor.png",tc+"T_Trim_Normal.png",.66,.08)
 mats.asphalt=_std(tc+"T_Concrete_Asphalt_BaseColor.png",tc+"T_Concrete_Normal.png",.9,0.0)
 mats.interior=_std(tc+"T_MarbleFloor_BaseColor.png",tc+"T_MarbleFloor_Normal.png",.42,0.0)
 mats.glass=StandardMaterial3D.new();mats.glass.albedo_color=Color(.10,.13,.16);mats.glass.metallic=.25;mats.glass.roughness=.18
 mats.windows=StandardMaterial3D.new()
 var lit=load(tc+"T_lit_interior_1.png")
 if lit:
  mats.windows.albedo_texture=lit;mats.windows.emission_enabled=true;mats.windows.emission=Color(1.0,.86,.62);mats.windows.emission_energy_multiplier=.22;mats.windows.roughness=.55
 else:
  mats.windows.albedo_color=Color(.22,.24,.28)
 for v in VARIANTS:
  var packed=load("res://assets/city/%s.gltf"%v["scene"])
  if packed==null:slices.append([]);continue
  var inst=packed.instantiate()
  var mi=_find_mesh(inst)
  var out=[]
  if mi:
   var mesh=mi.mesh
   for i in range(mesh.get_surface_count()):
    var slice=mesh.duplicate()
    for j in range(slice.get_surface_count()-1,-1,-1):
     if j!=i:slice.surface_remove(j)
    out.append({"mesh":slice,"mat":_mat_for(str(mesh.surface_get_material(i)))})
  inst.free()
  slices.append(out)
func _std(albedo,normal,rough,metal):
 var m=StandardMaterial3D.new()
 var t=load(albedo);if t:m.albedo_texture=t
 var n=load(normal);if n:m.normal_enabled=true;m.normal_texture=n;m.normal_scale=.7
 m.roughness=rough;m.metallic=metal
 return m
func _mat_for(surface_name):
 var n=surface_name
 if "RedBrick" in n:return mats.brick
 if "MetalConcrete" in n:return mats.metal
 if "Trim" in n:return mats.trim
 if "FakeInterior" in n:return mats.windows
 if "Glass" in n:return mats.glass
 if "Interior" in n:return mats.interior
 if "Asphalt" in n:return mats.asphalt
 return mats.concrete
func _find_mesh(root):
 if root is MeshInstance3D:return root
 for c in root.get_children():
  var f=_find_mesh(c)
  if f:return f
 return null
func place(pos,size,tint):
 if not active:return false
 if placed_count>=110:return false
 if Vector2(pos.x,pos.z).distance_to(Vector2(240,240))>135.0:return false
 var w=size.x;var d=size.z;var h=size.y
 var mn=minf(w,d);var mx=maxf(w,d)
 if mn<6.0 or mx/mn>2.55 or h<5.2:return false
 var area=w*d
 var vi=0
 if area>=300.0:vi=2
 elif area>=165.0:vi=1
 if slices[vi].is_empty():return false
 var v=VARIANTS[vi]
 var xf=Transform3D()
 xf.basis=xf.basis.scaled(Vector3(clampf(w/v["w"],.62,1.85),clampf(h/v["h"],.62,1.85),clampf(d/v["d"],.62,1.85)))
 xf.origin=Vector3(pos.x,0.0,pos.z)
 var key="%d/%d"%[int(floor(pos.x/BLOCK)),int(floor(pos.z/BLOCK))]
 var k2=key+"|"+str(vi)
 if not pending.has(k2):pending[k2]={"v":vi,"xf":[],"col":[]}
 pending[k2]["xf"].append(xf);pending[k2]["col"].append(tint)
 placed_count+=1
 return true
func finalize(parent):
 if not active:return
 print("KIT finalize blocks=",pending.size()," buildings=",placed_count)
 for k2 in pending:
  var entry=pending[k2];var vi=entry["v"]
  for si in range(slices[vi].size()):
   var s=slices[vi][si]
   var mm=MultiMesh.new()
   mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true
   mm.mesh=s["mesh"];mm.instance_count=entry["xf"].size()
   for i in range(entry["xf"].size()):
    mm.set_instance_transform(i,entry["xf"][i])
    mm.set_instance_color(i,entry["col"][i])
   var mmi=MultiMeshInstance3D.new();mmi.multimesh=mm;mmi.material_override=s["mat"]
   mmi.name="Kit_%s_%d"%[k2,si]
   parent.add_child(mmi)
 pending.clear()
