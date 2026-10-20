extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var av=game.player.avatar
 # remove ALL wear attachments + springs + hair — only skinned garments remain
 for s in av.springs:
  if is_instance_valid(s):s.queue_free()
 av.springs.clear()
 for w in av.wear_nodes:
  if is_instance_valid(w):w.queue_free()
 av.wear_nodes.clear()
 for b in ["Head","spine_03"]:
  var id=av.skeleton.find_bone(b)
  if id>=0:
   var att=av.skeleton.get_node_or_null("BoneAttachment3D")
 # remove hair too
 for child in av.skeleton.get_children():
  if child is BoneAttachment3D:child.queue_free()
 for f in range(10):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 cam.position=av.global_position+Vector3(0,1.25,2.9);cam.look_at(av.global_position+Vector3(0,1.0,0),Vector3.UP)
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/nowear.png")
 game.audio_node.shutdown();OS.delay_msec(80);quit(0)
