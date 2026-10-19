extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(0,false)
 await game.start_game(false)
 for i in range(4):await physics_frame
 var car=load("res://scripts/vehicle.gd").new();game.add_child(car)
 car.configure({"id":999,"type":"sedan","x":3000,"y":1200,"a":0.0},game.world.data.types,2,null)
 for i in range(3):await RenderingServer.frame_post_draw
 print("PROBE length_m=",car.length_m," width_m=",car.width_m," height_m=",car.height_m)
 print("PROBE visual_scale=",car.visual.scale)
 var model=car.visual.get_child(0)
 print("PROBE model_pos=",model.position," model_scale=",model.scale)
 for n in model.get_children():
  if n is MeshInstance3D:
   var aabb=n.mesh.get_aabb()
   print("PROBE mesh ",n.name," aabb=",aabb," pos=",n.position)
 game.audio_node.shutdown();quit(0)
