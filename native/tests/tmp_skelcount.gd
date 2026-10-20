extends SceneTree
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(2,false)
 await game.start_game(false)
 for i in range(16):await physics_frame
 var av=game.player.avatar
 var skels=[]
 _scan(av.model,skels)
 print("SKELS=",skels.size())
 for s in skels:print("  SKEL node=",s.name," bones=",s.get_bone_count()," parent=",s.get_parent().name)
 for n in ["TopLong","PantsLong","HoodShell","Sphere.005_Retopology.004","Face"]:
  var node=av.model.find_child(n,true,false)
  if node:print("NODE ",n," parent=",node.get_parent().name," gpos=",node.global_position)
 game.audio_node.shutdown();OS.delay_msec(80);quit(0)
func _scan(n,out):
 if n is Skeleton3D:out.append(n)
 for c in n.get_children():_scan(c,out)
