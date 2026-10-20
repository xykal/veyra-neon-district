extends RefCounted
# Nature kit — pohon/semak (nature pack CC0) + prop jalanan (downtown kit CC0).
const TREES=["CommonTree_1","CommonTree_2","CommonTree_4"]
const BLOCK=80.0
var tree_slices=[]
var tree_pending={}
var bush_pending={}
var bushes={}
var planter_scene
var bollard_scene
var plant_scene
var active=false
var tree_count=0
var prop_count=0
var _deferred_parent:Node
func setup(quality,parent):
 _deferred_parent=parent
 active=quality>=1
 if not active or not tree_slices.is_empty():return
 for v in TREES:
  var packed=load("res://assets/nature/%s.glb"%v)
  var out=[]
  if packed:
   var inst=packed.instantiate()
   var mi=_find_mesh(inst)
   if mi:
    var mesh=mi.mesh
    for i in range(mesh.get_surface_count()):
     var slice=mesh.duplicate()
     for j in range(slice.get_surface_count()-1,-1,-1):
      if j!=i:slice.surface_remove(j)
     out.append({"mesh":slice,"mat":mesh.surface_get_material(i)})
   inst.free()
  tree_slices.append(out)
 for spec in [["common","res://assets/nature/Bush_Common.glb"],["flowers","res://assets/nature/Bush_Common_Flowers.glb"]]:
  var packed=load(spec[1]);var entry={}
  if packed:
   var inst=packed.instantiate();var mi=_find_mesh(inst)
   if mi:
    var mesh=mi.mesh
    var slice=mesh.duplicate()
    for j in range(slice.get_surface_count()-1,-1,-1):
     if j!=0:slice.surface_remove(j)
    entry={"mesh":slice,"mat":mesh.surface_get_material(0)}
   inst.free()
  bushes[spec[0]]=entry
 planter_scene=load("res://assets/city/Prop_Planter_Single.gltf")
 bollard_scene=load("res://assets/city/Prop_Bollard.gltf")
 plant_scene=load("res://assets/nature/Plant_1_Big.glb")
func _find_mesh(root):
 if root is MeshInstance3D:return root
 for c in root.get_children():
  var f=_find_mesh(c)
  if f:return f
 return null
func place_tree(pos,r,tone):
 if not active:return false
 if Vector2(pos.x,pos.z).distance_to(Vector2(240,240))>112.0:return false
 var h=r*2.2
 var vi=int(abs(pos.x*7.0+pos.z*13.0))%3
 if tree_slices[vi].is_empty():return false
 var rng=int(abs(pos.x*31.0+pos.z*17.0))
 var yaw=float(rng%360)*0.01745
 var scale=clampf(h/7.6,.42,1.55)
 var xf=Transform3D(Basis(Vector3.UP,yaw).scaled(Vector3.ONE*scale),pos)
 var key="%d/%d"%[int(floor(pos.x/BLOCK)),int(floor(pos.z/BLOCK))]
 var k2=key+"|"+str(vi)
 if not tree_pending.has(k2):tree_pending[k2]={"v":vi,"xf":[],"col":[]}
 tree_pending[k2]["xf"].append(xf)
 tree_pending[k2]["col"].append(tone)
 tree_count+=1
 if rng%6==0 and bushes.has("common") and not bushes["common"].is_empty():
  var kind="flowers" if rng%12==0 else "common"
  if not bush_pending.has(kind):bush_pending[kind]=[]
  bush_pending[kind].append(Transform3D(Basis(Vector3.UP,yaw*1.7),pos+Vector3(cos(yaw)*1.9,0,sin(yaw)*1.9)))
 return true
func place_street_props(pos,size):
 if not active or planter_scene==null:return
 var rng=int(abs(pos.x*13.0+pos.z*29.0))
 if rng%2==0:
  for corner in [Vector3(size.x*.5+2.0,0,-size.z*.35),Vector3(-size.x*.5-2.0,0,size.z*.35)]:
   var p=planter_scene.instantiate();p.position=pos+corner;p.position.y=0;p.rotation.y=float(rng%628)/100.0
   _deferred_parent.add_child(p);prop_count+=1
   if plant_scene:
    var pl=plant_scene.instantiate();pl.position=p.position+Vector3(0,.42,0);pl.scale=Vector3.ONE*.9
    _deferred_parent.add_child(pl)
 if rng%3==0 and bollard_scene:
  for i in range(3):
   var bp=pos+Vector3(-size.x*.5-2.2+i*2.2,0,size.z*.5+2.2)
   var bl=bollard_scene.instantiate();bl.position=bp;bl.position.y=0
   _deferred_parent.add_child(bl);prop_count+=1
func finalize(parent):
 if not active:return
 _deferred_parent=parent
 for k2 in tree_pending:
  var entry=tree_pending[k2];var vi=entry["v"]
  for si in range(tree_slices[vi].size()):
   var s=tree_slices[vi][si]
   var mm=MultiMesh.new()
   mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true
   mm.mesh=s["mesh"];mm.instance_count=entry["xf"].size()
   for i in range(entry["xf"].size()):
    mm.set_instance_transform(i,entry["xf"][i])
    mm.set_instance_color(i,entry["col"][i])
   var mmi=MultiMeshInstance3D.new();mmi.multimesh=mm;mmi.material_override=s["mat"]
   mmi.name="Tree_%s_%d"%[k2,si]
   parent.add_child(mmi)
 tree_pending.clear()
 for kind in bush_pending:
  if bush_pending[kind].is_empty() or bushes[kind].is_empty():continue
  var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D
  mm.mesh=bushes[kind]["mesh"];mm.instance_count=bush_pending[kind].size()
  for i in range(bush_pending[kind].size()):mm.set_instance_transform(i,bush_pending[kind][i])
  var mmi=MultiMeshInstance3D.new();mmi.multimesh=mm;mmi.material_override=bushes[kind]["mat"]
  mmi.name="BushAll_"+kind;parent.add_child(mmi)
 bush_pending.clear()
 print("NATURE trees=",tree_count," props=",prop_count)
