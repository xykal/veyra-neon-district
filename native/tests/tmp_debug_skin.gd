extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var av=game.player.avatar
 # freeze animation completely
 if av.animator:av.animator.stop();av.animator.active=false
 if av.skeleton:av.skeleton.reset_bone_poses()
 for f in range(8):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 cam.position=av.global_position+Vector3(0,1.25,2.9);cam.look_at(av.global_position+Vector3(0,1.0,0),Vector3.UP)
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/rest-front.png")
 # report skeleton + garment node info
 print("SKEL ", av.skeleton.get_bone_count(), " bones")
 for n in ["TopLong.001","PantsLong.001","HoodShell","Sphere.005_Retopology.004"]:
  var node=av.model.find_child(n,true,false)
  if node:
   print("NODE ",n," parent=",node.get_parent().name if node.get_parent() else "?"," skin=",node.skin!=null," visible=",node.visible)
 print("SPRINGS ", av.springs.size())
 for s in av.springs:
  print("SPRING bone_a=",s.bone_a," bone_b=",s.bone_b," skel=",s.skeleton!=null)
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
