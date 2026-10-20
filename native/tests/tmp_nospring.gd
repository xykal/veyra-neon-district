extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var av=game.player.avatar
 for s in av.springs:s.set_process(false)  # freeze ALL springs
 # also hard-reset cloth bones to identity
 for b in ["cloth_hood_a","cloth_hood_b","cloth_tail_a","cloth_tail_b"]:
  var id=av.skeleton.find_bone(b)
  if id>=0:av.skeleton.set_bone_pose_rotation(id,Quaternion.IDENTITY)
 for f in range(10):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 cam.position=av.global_position+Vector3(0,1.25,2.9);cam.look_at(av.global_position+Vector3(0,1.0,0),Vector3.UP)
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/nospring.png")
 game.audio_node.shutdown();OS.delay_msec(80);quit(0)
