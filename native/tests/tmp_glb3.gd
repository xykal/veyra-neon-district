extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 var skel=glb.find_child("Skeleton3D",true,false)
 var env=WorldEnvironment.new()
 var e=Environment.new()
 e.background_mode=Environment.BG_COLOR
 e.background_color=Color(0.85,0.87,0.92)
 e.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
 e.ambient_light_color=Color.WHITE
 e.ambient_light_energy=1.0
 env.environment=e
 root.add_child(env)
 for n in glb.find_children("*","MeshInstance3D",true,false):
  var m=StandardMaterial3D.new()
  m.albedo_color=Color(0.9,0.75,0.6)
  m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
  n.material_override=m
 anim.play("Walk")
 anim.seek(0.32,true)
 anim.pause()
 skel.force_update_all_bone_transforms()
 for f in range(6):
  await RenderingServer.frame_post_draw
 var cam=Camera3D.new()
 cam.fov=50
 cam.current=true
 root.add_child(cam)
 cam.position=Vector3(0,1.25,3.2)
 cam.look_at(Vector3(0,1.0,0),Vector3.UP)
 for f in range(8):
  await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/bright-walk.png")
 anim.play("Idle")
 anim.seek(0.4,true)
 anim.pause()
 skel.force_update_all_bone_transforms()
 for f in range(8):
  await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/bright-idle.png")
 OS.delay_msec(80)
 quit(0)
