extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 for n in ["TopLong","TopShort","PantsLong","Boots","Sphere.005_Retopology"]:
  var node=glb.find_child(n,true,false)
  if node==null:
   print("MISSING ",n)
   continue
  var m=node.mesh
  print("MESH ",node.name," surfaces=",m.get_surface_count())
  var a=m.surface_get_arrays(0)
  var v=a[Mesh.ARRAY_VERTEX]
  print("  verts=",v.size()," idx=",a[Mesh.ARRAY_INDEX].size() if a[Mesh.ARRAY_INDEX] else 0)
  var torso=0
  for i in range(v.size()):
   if absf(v[i].x)<0.3 and v[i].y>0.88 and v[i].y<1.42: torso+=1
  print("  TORSO-zone verts in Godot mesh=",torso)
 OS.delay_msec(80)
 quit(0)
