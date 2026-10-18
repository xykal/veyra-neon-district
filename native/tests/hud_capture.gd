extends SceneTree
# Actual native engine UI capture for review, not an AI mockup or device performance benchmark.
var output="user://hud.png"
var mode="foot"
func _initialize():
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--out="):output=str(arg).trim_prefix("--out=")
  if str(arg).begins_with("--mode="):mode=str(arg).trim_prefix("--mode=")
 call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(0,false);game.ui.touch.enabled=true
 if mode!="menu":
  await game.start_game(false)
  for i in range(20):await physics_frame
  if mode=="drive":
   game.candidate=game._candidate();game.interact()
   if game.player.driving==null:push_error("Capture requires real vehicle entry");quit(1);return
  game.ui.toast_time=0;game.ui.update_hud()
 for i in range(10):await RenderingServer.frame_post_draw
 var error=root.get_texture().get_image().save_png(output);print("NATIVE_HUD_CAPTURE ",mode," result=",error)
 game.audio_node.shutdown();OS.delay_msec(120);quit(0 if error==OK else 1)
