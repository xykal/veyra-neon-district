extends RefCounted
# Street kit — marka jalan (downtown kit CC0): crosswalk + panah di persimpangan kota.
var decals={}
var parent_node:Node
var count=0
func setup(parent):
 parent_node=parent
 if not decals.is_empty():return
 var tc="res://assets/city/"
 decals.cross=_load_dec(tc+"Decal_Crosswalk.gltf")
 decals.straight=_load_dec(tc+"Decal_ArrowStraight.gltf")
 decals.left=_load_dec(tc+"Decal_ArrowTurnLeft.gltf")
 decals.right=_load_dec(tc+"Decal_ArrowTurnLeft.gltf")
func _load_dec(path):
 var packed=load(path)
 if packed==null:return null
 var inst=packed.instantiate()
 var out=[]
 for n in _all(inst):
  if n is MeshInstance3D:
   for i in range(n.mesh.get_surface_count()):
    var slice=n.mesh.duplicate()
    for j in range(slice.get_surface_count()-1,-1,-1):
     if j!=i:slice.surface_remove(j)
    out.append({"mesh":slice,"mat":n.mesh.surface_get_material(i)})
 inst.free()
 return out
func _all(root):
 var out=[root]
 for c in root.get_children():out.append_array(_all(c))
 return out
func place_intersection(cx,cz):
 if decals.is_empty():return
 var road=4.8
 for spec in [["cross",Vector3(0,.02,road+1.6),0.0],["cross",Vector3(0,.02,-road-1.6),0.0],["cross",Vector3(road+1.6,.02,0),PI/2],["cross",Vector3(-road-1.6,.02,0),PI/2],
  ["straight",Vector3(0,.021,-road-7.0),0.0],["left",Vector3(-1.9,.021,road+8.0),PI],["right",Vector3(1.9,.021,-road-12.0),PI]]:
  var entry=decals[spec[0]]
  if entry==null:continue
  for s in entry:
   var mi=MeshInstance3D.new()
   mi.mesh=s["mesh"];mi.material_override=s["mat"]
   mi.position=Vector3(cx,0,cz)+spec[1]
   mi.rotation.y=spec[2]+(PI/2 if (cx+cz)>480 else 0.0)
   mi.name="Decal"
   parent_node.add_child(mi);count+=1
