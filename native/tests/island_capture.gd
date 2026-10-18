extends SceneTree
# Review capture of the Lombok-inspired island shell. Uses the real native world.
var output="user://island.png"
func _initialize():
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--out="):output=str(arg).trim_prefix("--out=")
 call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(0,false)
 await game.start_game(false)
 for i in range(20):await physics_frame
 if game.world and game.world.environment:
  game.world.environment.environment.fog_density=.0012
 var views=[Vector3(30,0.1,120),Vector3(450,0.1,250),Vector3(240,0.1,30),Vector3(240,0.1,450)]
 var yaws=[PI,0.0,-PI/2,PI/2]
 for i in range(4):
  if game.player:
   game.player.global_position=views[i]
   game.player.camera_yaw=yaws[i]
   game.player.camera_pitch=.18
   game.player.velocity=Vector3.ZERO
  for f in range(14):await RenderingServer.frame_post_draw
  var path=output.get_basename()+"-"+str(i)+".png"
  var error=root.get_texture().get_image().save_png(path);print("NATIVE_ISLAND_CAPTURE ",i," result=",error," path=",path)
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
