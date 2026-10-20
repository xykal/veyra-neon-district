extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 var env=WorldEnvironment.new()
 var e=Environment.new()
 e.background_mode=Environment.BG_COLOR
 e.background_color=Color(0.25,0.3,0.4)
 env.environment=e
 root.add_child(env)
 for n in glb.find_children("*","MeshInstance3D",true,false):
  if n.name.begins_with("TopLong"):
   var m=StandardMaterial3D.new()
   m.albedo_color=Color(1,0.3,0.2)
   m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
   m.cull_mode=BaseMaterial3D.CULL_DISABLED
   n.material_override=m
   n.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
  else:
   n.visible=false
 for f in range(6):
  await RenderingServer.frame_post_draw
 var cam=Camera3D.new()
 cam.fov=55
 cam.current=true
 root.add_child(cam)
 cam.position=Vector3(0.4,1.35,2.2)
 cam.look_at(Vector3(0,1.25,0),Vector3.UP)
 for f in range(8):
  await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/onlytop.png")
 OS.delay_msec(80)
 quit(0)
