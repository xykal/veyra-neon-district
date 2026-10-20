extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate()
 root.add_child(game)
 game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):
  await physics_frame
 game.ui.show_game()
 game.player.enabled=false
 game.player.global_position=Vector3(250,5.95,452)
 var av=game.player.avatar
 var anim=av.find_child("AnimationPlayer",true,false)
 if anim:
  anim.play("Walk")
  anim.seek(0.3,true)
  anim.pause()
 for f in range(6):
  await RenderingServer.frame_post_draw
 var views={"A":Vector3(1.6,2.2,2.2),"B":Vector3(-2.2,2.0,1.6),"C":Vector3(0.2,1.9,-2.6)}
 for v in views:
  var cam=Camera3D.new()
  cam.fov=46
  cam.current=true
  root.add_child(cam)
  cam.position=av.global_position+views[v]
  cam.look_at(av.global_position+Vector3(0,0.85,0),Vector3.UP)
  for f in range(10):
   await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/tmp/mine/shot-%s.png"%v)
  cam.current=false
  cam.queue_free()
 game.audio_node.shutdown()
 OS.delay_msec(80)
 quit(0)
