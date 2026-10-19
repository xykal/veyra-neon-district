extends SceneTree
# Diagnostic capture rig: maps, cars, avatars, lobby, loading. Writes small PNGs for contact sheets.
var outdir="../native/screenshots/diag"
func _initialize():call_deferred("run")
func _shot(path):
 await RenderingServer.frame_post_draw
 var img=get_root().get_texture().get_image()
 img.resize(420,236,Image.INTERPOLATE_BILINEAR)
 var err=img.save_png(outdir+"/"+path)
 print("DIAG_SHOT ",path," result=",err)
func run():
 DirAccess.make_dir_recursive_absolute(outdir)
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 game.ui.show_game()
 if game.world:
  for node in game.world.batch_nodes:node.visibility_range_end=2400.0
  game.world.distance_limit=2400.0
 # ---- MAP SWEEP (player at street-safe spots) ----
 var spots=[
  ["map_city",Vector3(240,0.35,240),PI/2],
  ["map_north",Vector3(240,0.35,60),-PI/2],
  ["map_south",Vector3(240,0.35,420),PI/2],
  ["map_west",Vector3(60,0.35,240),PI],
  ["map_coast",Vector3(240,0.35,30),-PI/2],
  ["map_slope",Vector3(240,6.0,-30),-PI/2],
  ["map_beach",Vector3(160,0.35,470),PI/2],
  ["map_gili",Vector3(20,0.35,240),PI],
  ["map_east",Vector3(420,0.35,300),0.0],
 ]
 for s in spots:
  game.player.global_position=s[1];game.player.velocity=Vector3.ZERO
  game.player.camera_yaw=s[2];game.player.camera_pitch=.10
  for f in range(10):await RenderingServer.frame_post_draw
  await _shot(s[0]+".png")
 # ---- CARS ----
 game.player.enabled=false
 var cam=Camera3D.new();cam.fov=55;cam.current=true;root.add_child(cam)
 var types=["sedan","sport","suv","taxi","police","firetruck","bus","pickup"]
 var n=0
 for t in types:
  var car=load("res://scripts/vehicle.gd").new()
  game.add_child(car)
  car.configure({"id":900+n,"type":t,"x":3000,"y":1200,"a":0.6},game.world.data.types,2,null)
  car.freeze=true
  for f in range(6):await RenderingServer.frame_post_draw
  var center=car.global_position+Vector3(0,0.9,0)
  cam.position=center+Vector3(6.2,2.6,6.2);cam.look_at(center,Vector3.UP)
  for f in range(6):await RenderingServer.frame_post_draw
  await _shot("car_"+t+".png")
  cam.position=center+Vector3(-5.4,2.2,7.2);cam.look_at(center,Vector3.UP)
  for f in range(4):await RenderingServer.frame_post_draw
  await _shot("car_"+t+"_b.png")
  car.queue_free()
  n+=1
 # ---- AVATARS ----
 game.player.enabled=true
 for look in range(6):
  game.player.set_look(look)
  for f in range(8):await RenderingServer.frame_post_draw
  var ap=game.player.avatar.global_position
  game.player.camera_yaw=0.8;game.player.camera_pitch=.05
  game.player.pivot.rotation=Vector3(-.05,-0.8-PI/2,0)
  game.player.spring.spring_length=2.6
  for f in range(6):await RenderingServer.frame_post_draw
  await _shot("avatar_"+str(look)+".png")
 # ---- LOBBY + LOADING ----
 game.ui.show_menu()
 for f in range(6):await RenderingServer.frame_post_draw
 await _shot("ui_menu.png")
 game.ui.set_loading(true,.42,"Memuat distrik")
 for f in range(6):await RenderingServer.frame_post_draw
 await _shot("ui_loading.png")
 game.ui.set_loading(false,1,"Siap")
 print("DIAG_DONE")
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
