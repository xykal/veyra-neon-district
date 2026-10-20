extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate();root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 anim.play("Walk");anim.seek(0.3,true);anim.pause()
 var colors={"TopLong":Color(1,0,0),"TopShort":Color(1,.5,0),"PantsLong":Color(0,1,0),
  "Boots":Color(0,.5,1),"HoodShell":Color(1,1,0),"TailShell":Color(1,0,1),"Sphere":Color(1,1,1)}
 for key in colors:
  var node=glb.find_child(key,true,false)
  if node and node is MeshInstance3D:
   var m=StandardMaterial3D.new();m.albedo_color=colors[key];m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
   node.material_override=m
   print("COLOR ",key," -> ",node.name)
 for f in range(8):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=50;cam.current=true;root.add_child(cam)
 cam.position=Vector3(0,1.25,3.2);cam.look_at(Vector3(0,1.0,0),Vector3.UP)
 for f in range(10):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/colorcode.png")
 OS.delay_msec(80);quit(0)
