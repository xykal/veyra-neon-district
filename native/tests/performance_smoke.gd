extends SceneTree
# Resource/lifecycle guards for low-RAM Android. No claimed physical-device FPS threshold.
var checks=0
var failures=0
func check(value,label):
 checks+=1
 if not value:failures+=1;push_error("PERFORMANCE_ASSERT "+label)
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(0,false)
 check(not game.world.built,"menu must not construct a full city")
 check(game.player==null,"menu must not allocate a hidden player duplicate")
 check(game.preview.physical.is_empty(),"preview must not allocate physical ragdoll bodies")
 var collision_count=-1
 for cycle in range(4):
  await game.start_game(false)
  for i in range(20):await physics_frame
  check(game.playing and not game.loading,"incremental loading completes")
  check(game.vehicles.size()<=13,"low profile vehicle budget")
  check(game.npcs.size()<=2,"low profile practice actor budget")
  check(game.player.avatar.physical.is_empty() or game.player.avatar.ragdoll_prepared,"physical bones only appear on demand")
  check(not game.player.collision.disabled,"capsule re-enabled after returning from ragdoll")
  check(not game.preview.animator.active,"hidden lobby animator is suspended")
  if collision_count<0:collision_count=game.world.collision_shape_count
  check(game.world.collision_shape_count==collision_count,"city shapes do not accumulate on rejoin")
  check(game.world.material_cache.size()<=12,"static material palette is shared")
  var forbidden=false;var terrains=0
  for n in game.world.get_children():
   if n.has_meta("terrain_surface"):terrains+=1
   if n.has_meta("kind") and n.get_meta("kind") in ["road","sidewalk","paint","window"]:forbidden=true
  check(not forbidden,"no coplanar road/window box layers")
  check(terrains==1,"exactly one terrain render surface")
  game.player.knockdown(Vector3(1,1,0),3)
  for i in range(10):await physics_frame
  check(game.player.avatar.physical.size()==11,"low ragdoll creates only eleven physical bodies")
  check(game.player.avatar.ragdoll,"physical ragdoll can still activate")
  game.return_lobby()
  for i in range(4):await process_frame
  check(game.vehicles.is_empty(),"leaving releases the vehicle scene cache")
  check(game.remote.is_empty(),"leaving clears remote actors")
  check(not game.player.avatar.ragdoll,"leaving stops active player ragdoll simulation")
  check(not game.player.avatar.animator.active,"hidden player animator is suspended")
 await game.start_game(false)
 await game._stream_vehicles(Vector3(440,0,420))
 check(game.vehicles.size()<=13,"travelling streams vehicles instead of accumulating all 110")
 game._notification(MainLoop.NOTIFICATION_OS_MEMORY_WARNING)
 check(game.quality==0 and game.memory_warnings==1,"OS memory warning activates safe mode")
 check(game.get_viewport().msaa_3d==Viewport.MSAA_DISABLED,"safe mode does not allocate MSAA")
 var report=JSON.stringify(game.diagnostic_data()).to_lower()
 check(not ("token" in report or "password" in report or "nickname" in report or "chat" in report),"diagnostics contain no session secrets or chat")
 print("NATIVE_PERFORMANCE_","PASS" if failures==0 else "FAIL"," checks=",checks," failures=",failures," material_count=",game.world.material_cache.size()," static_shapes=",game.world.collision_shape_count)
 game.return_lobby();game.audio_node.shutdown();OS.delay_msec(120)
 for i in range(2):await process_frame
 call_deferred("finish")
func finish():quit(0 if failures==0 else 1)
