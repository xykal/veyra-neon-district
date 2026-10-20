extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var av=game.player.avatar
 var palette=[Color(1,0,0),Color(0,1,0),Color(0,.5,1),Color(1,1,0),Color(1,0,1),Color(1,.5,0),Color(.5,.5,1),Color(1,1,1),Color(.5,1,1)]
 var i=0
 for child in av.model.get_children():_paint(child,palette,i)
 # also scan deeper
 func_dummy(av.model,palette)
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 cam.position=av.global_position+Vector3(1.8,1.35,2.6);cam.look_at(av.global_position+Vector3(0,1.0,0),Vector3.UP)
 for f in range(14):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/who.png")
 game.audio_node.shutdown();OS.delay_msec(80);quit(0)
var _idx=0
func func_dummy(n,palette):
 for c in n.get_children():
  _paint(c,palette,_idx)
  func_dummy(c,palette)
func _paint(n,palette,i):
 if n is MeshInstance3D:
  var m=StandardMaterial3D.new()
  m.albedo_color=palette[_idx%palette.size()]
  m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
  n.material_override=m
  print("PAINT ",_idx," ",n.name," parent=",n.get_parent().name)
  _idx+=1
