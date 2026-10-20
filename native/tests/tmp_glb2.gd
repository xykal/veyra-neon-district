extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate();root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 anim.play("Walk");anim.seek(0.35,true)
 for f in range(8):await RenderingServer.frame_post_draw
 var skel=glb.find_child("Skeleton3D",true,false)
 skel.force_update_all_bone_transforms()
 for f in range(6):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=50;cam.current=true;root.add_child(cam)
 cam.position=Vector3(0,1.25,3.2);cam.look_at(Vector3(0,1.0,0),Vector3.UP)
 for f in range(10):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/glb-walk.png")
 OS.delay_msec(80);quit(0)
