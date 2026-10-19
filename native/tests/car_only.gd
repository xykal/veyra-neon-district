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
 game.player.enabled=false
 if game.world:
  for node in game.world.batch_nodes:node.visibility_range_end=2400.0
 var cam=Camera3D.new();cam.fov=55;cam.current=true;root.add_child(cam)
 var types=["sedan","sport","suv","taxi","police","firetruck","bus","pickup"]
 var n=0
 for t in types:
  var car=load("res://scripts/vehicle.gd").new();game.add_child(car)
  car.configure({"id":900+n,"type":t,"x":3000,"y":1200,"a":0.6},game.world.data.types,2,null)
  car.freeze=true
  for f in range(6):await RenderingServer.frame_post_draw
  var center=car.global_position+Vector3(0,0.8,0)
  cam.position=center+Vector3(5.6,2.3,5.6);cam.look_at(center,Vector3.UP)
  for f in range(5):await RenderingServer.frame_post_draw
  await _shot("car_"+t+".png")
  cam.position=center+Vector3(-5.2,2.1,6.0);cam.look_at(center,Vector3.UP)
  for f in range(4):await RenderingServer.frame_post_draw
  await _shot("car_"+t+"_b.png")
  car.queue_free();n+=1
 print("CAR_DONE")
 game.audio_node.shutdown();OS.delay_msec(120);quit(0)
