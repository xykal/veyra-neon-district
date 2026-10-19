extends SceneTree
func _initialize():call_deferred("run")
func run():
 var _game=load("res://scenes/main.tscn").instantiate();root.add_child(_game)
 _game.set_quality(2,false);await _game.start_game(false)
 _game.set_process(false);_game.set_physics_process(false)
 for id in _game.vehicles.keys():_game.vehicles[id].queue_free()
 _game.vehicles.clear()
 if _game.player: _game.player.visible=false
 for n in get_nodes_in_group("npcs"):
  if is_instance_valid(n): n.visible=false
 var car=load("res://scripts/vehicle.gd").new();_game.add_child(car)
 car.configure({"id":998,"type":"sedan","x":2830.0,"y":1560.0,"a":0.6},_game.world.data.types,2)
 for n in car.visual.get_children():
  for m in n.get_children():
   if false:m.visible=false
 var cam=Camera3D.new();_game.add_child(cam);cam.current=true;cam.fov=55.0
 var side=Vector3(5.9,1.15,0).rotated(Vector3.UP,car.rotation.y)
 cam.global_position=car.global_position+side
 cam.look_at(car.global_position+Vector3(0,.55,0))
 for f in range(4):await RenderingServer.frame_post_draw
 await RenderingServer.frame_post_draw
 get_root().get_texture().get_image().save_png("../native/screenshots/diag/car-big.png")
 print("BIG_OK")
 quit(0)
