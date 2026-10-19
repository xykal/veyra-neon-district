extends SceneTree
var outdir="../native/screenshots/diag"
func _initialize():call_deferred("run")
func _shot(path):
 await RenderingServer.frame_post_draw
 var img=get_root().get_texture().get_image();img.resize(420,236,Image.INTERPOLATE_BILINEAR)
 print("DIAG_SHOT ",path," result=",img.save_png(outdir+"/"+path))
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(12):await physics_frame
 game.ui.show_game()
 # open beach, camera looking back at character with sea behind
 game.player.global_position=Vector3(240,0.35,440)
 game.player.camera_yaw=0.0
 game.player.camera_pitch=0.0
 for look in range(6):
  game.player.set_look(look)
  game.player.avatar.visible=true
  for f in range(8):await RenderingServer.frame_post_draw
  game.player.pivot.rotation=Vector3(-0.02,-PI/2,0)
  game.player.spring.spring_length=3.4
  game.player.avatar.visible=true
  for f in range(6):await RenderingServer.frame_post_draw
  await _shot("avatar_"+str(look)+".png")
 print("AV_DONE")
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
