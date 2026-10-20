extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 var skel=glb.find_child("Skeleton3D",true,false)
 print("GLB anim=",anim!=null," skel=",skel!=null," bones=",skel.get_bone_count() if skel else 0)
 if anim:
  print("CLIPS=",anim.get_animation_list().size())
  anim.play("Walk_Loop");anim.seek(0.4,true)
 for f in range(8):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 var pos=glb.global_position
 cam.position=pos+Vector3(0,1.25,2.9);cam.look_at(pos+Vector3(0,1.0,0),Vector3.UP)
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/glb-only.png")
 OS.delay_msec(80);quit(0)
