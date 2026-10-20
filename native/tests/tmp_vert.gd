extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 var skel=glb.find_child("Skeleton3D",true,false)
 var top=glb.find_child("TopLong",true,false)
 var arrays=top.mesh.surface_get_arrays(0)
 var verts=arrays[Mesh.ARRAY_VERTEX]
 var js=arrays[Mesh.ARRAY_BONES]
 var ws=arrays[Mesh.ARRAY_WEIGHTS]
 var ids=[0,200,900]
 for vi in ids:
  print("VERT ",vi," bind=",verts[vi])
  for clip in ["Idle","Walk"]:
   anim.play(clip)
   anim.seek(0.32,true)
   skel.force_update_all_bone_transforms()
   var skinned=Vector3.ZERO
   for k in range(4):
    var bi=int(js[vi*4+k])
    var w=ws[vi*4+k]
    if w<=0.0:
     continue
    var gm=skel.get_bone_global_pose(bi)
    var rest_inv=skel.get_bone_global_rest(bi).affine_inverse()
    skinned+=(gm*rest_inv)*verts[vi]*w
   print("  SKINNED ",clip," = ",skinned)
 OS.delay_msec(80)
 quit(0)
