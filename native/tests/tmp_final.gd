extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var av=game.player.avatar
 var anim=av.find_child("AnimationPlayer",true,false)
 if anim:anim.play("Walk");anim.seek(0.32,true)
 for f in range(6):await RenderingServer.frame_post_draw
 var shots={"front":Vector3(0.4,1.35,2.7),"side":Vector3(2.7,1.35,0.3),"back":Vector3(-0.4,1.45,-2.7),"detail":Vector3(1.15,1.75,1.75)}
 for v in shots:
  var cam=Camera3D.new();cam.fov=48;cam.current=true;root.add_child(cam)
  cam.position=av.global_position+shots[v]
  cam.look_at(av.global_position+Vector3(0,1.02,0),Vector3.UP)
  for f in range(10):await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/tmp/mine/final-%s.png"%v)
  cam.current=false;cam.queue_free()
 game.audio_node.shutdown();OS.delay_msec(80);quit(0)
