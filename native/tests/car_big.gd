extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(12):await physics_frame
 game.ui.show_game();game.player.enabled=false
 var car=load("res://scripts/vehicle.gd").new();game.add_child(car)
 car.configure({"id":901,"type":"sedan","x":3000,"y":1200,"a":0.6},game.world.data.types,2,null)
 car.freeze=true
 for f in range(8):await RenderingServer.frame_post_draw
 var cam=Camera3D.new();cam.fov=55;cam.current=true;root.add_child(cam)
 var center=car.global_position+Vector3(0,0.8,0)
 cam.position=center+Vector3(4.9,2.1,-5.2);cam.look_at(center,Vector3.UP)
 for f in range(8):await RenderingServer.frame_post_draw
 get_root().get_texture().get_image().save_png("../native/screenshots/diag/car_big.png")
 print("BIG_DONE")
 game.audio_node.shutdown();quit(0)
