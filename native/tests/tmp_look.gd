extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.ui.notify("Uji baju baru — tekstur + skinning",3.0)
 game.player.enabled=false
 var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
 var pl=game.player
 var poses=[["front",Vector3(0,1.25,2.9)],["side",Vector3(2.9,1.25,0.3)],["back",Vector3(0,1.25,-2.9)]]
 for pose in poses:
  cam.position=pl.avatar.global_position+pose[1];cam.look_at(pl.avatar.global_position+Vector3(0,1.0,0),Vector3.UP)
  for f in range(12):await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/tmp/mine/look-"+pose[0]+".png")
 cam.position=pl.avatar.global_position+Vector3(1.1,1.55,1.7);cam.look_at(pl.avatar.global_position+Vector3(0,1.35,0),Vector3.UP);cam.fov=40
 for f in range(12):await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/tmp/mine/look-detail.png")
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
