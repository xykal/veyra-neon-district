extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate();root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 var skel=glb.find_child("Skeleton3D",true,false)
 anim.play("Idle");anim.seek(0.4,true);skel.force_update_all_bone_transforms()
 print("=== IDLE ===")
 _dump(skel)
 anim.play("Walk");anim.seek(0.32,true);skel.force_update_all_bone_transforms()
 print("=== WALK ===")
 _dump(skel)
 OS.delay_msec(80);quit(0)
func _dump(skel):
 for b in ["root","pelvis","spine_01","spine_02","spine_03","neck_01","Head","clavicle_l","clavicle_r","upperarm_l","lowerarm_l","thigh_l","calf_l","foot_l"]:
  var id=skel.find_bone(b)
  if id<0:continue
  var t=skel.get_bone_global_pose(id)
  var o=t.origin;var s=t.basis.get_scale()
  var bad=""
  if not is_finite(o.x) or not is_finite(o.y) or not is_finite(o.z):bad=" NaN_POS"
  if s.x<0.01 or s.y<0.01 or s.z<0.01 or s.x>3 or s.y>3 or s.z>3:bad+=" BAD_SCALE"
  print("BONE %-11s pos=(%.3f,%.3f,%.3f) scale=(%.3f,%.3f,%.3f)%s"%[b,o.x,o.y,o.z,s.x,s.y,s.z,bad])
