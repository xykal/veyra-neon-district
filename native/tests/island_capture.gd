extends SceneTree
# Review capture of the Lombok-inspired island shell. Uses the real native world.
var output="user://island.png"
func _initialize():
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--out="):output=str(arg).trim_prefix("--out=")
 call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(20):await physics_frame
 game.ui.show_game()
 # Street intersections keep the player out of building volumes (no fall-through).
 var views=[Vector3(240,0.35,60),Vector3(240,0.35,420),Vector3(60,0.35,240),Vector3(420,0.35,240)]
 var yaws=[-PI/2,PI/2,PI,0.0]
 if game.world:
  for node in game.world.batch_nodes:node.visibility_range_end=2400.0
  game.world.distance_limit=2400.0
 for i in range(4):
  if game.player:
   game.player.global_position=views[i]
   game.player.velocity=Vector3.ZERO
   game.player.camera_yaw=yaws[i]
   game.player.camera_pitch=.02 if i==0 else .14
  for f in range(16):await RenderingServer.frame_post_draw
  print("CAPDBG ",i," player=",game.player.global_position," cam=",game.player.camera.global_position," yaw=",game.player.camera_yaw)
  var path=output.get_basename()+"-"+str(i)+".png"
  var error=root.get_texture().get_image().save_png(path);print("NATIVE_ISLAND_CAPTURE ",i," result=",error," path=",path)
 # Hero shot: elevated bay camera facing Rinjani crater.
 if game.player:game.player.enabled=false
 var hero=Camera3D.new();hero.position=Vector3(205,26,175);hero.fov=62;hero.current=true;root.add_child(hero)
 hero.look_at(Vector3(312,16,-75),Vector3.UP)
 for f in range(16):await RenderingServer.frame_post_draw
 var hero_path=output.get_basename()+"-hero.png"
 var hero_err=root.get_texture().get_image().save_png(hero_path);print("NATIVE_ISLAND_CAPTURE hero result=",hero_err," path=",hero_path)
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
