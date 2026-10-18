extends SceneTree
# Rendered, uncapped, reproducible profile. Never presented as an Android device benchmark.
var output="user://render-benchmark.json"
var label="working-tree"
var samples=30
func _initialize():
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--out="):output=str(arg).trim_prefix("--out=")
  if str(arg).begins_with("--label="):label=str(arg).trim_prefix("--label=")
  if str(arg).begins_with("--samples="):samples=clampi(int(str(arg).trim_prefix("--samples=")),10,240)
 call_deferred("run")
func percentile(values,p):
 var sorted=values.duplicate();sorted.sort();return sorted[mini(sorted.size()-1,int((sorted.size()-1)*p))]
func run():
 var started=Time.get_ticks_usec()
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);game.set_quality(0,false)
 await process_frame
 await game.start_game(false)
 await RenderingServer.frame_post_draw
 var ready_ms=(Time.get_ticks_usec()-started)/1000.0
 Engine.max_fps=0
 for i in range(12):await RenderingServer.frame_post_draw
 var frames=[];var draws=[];var primitives=[];var prev=Time.get_ticks_usec()
 for i in range(samples):
  await RenderingServer.frame_post_draw
  var now=Time.get_ticks_usec();frames.append((now-prev)/1000.0);prev=now
  draws.append(int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)))
  primitives.append(int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)))
 var average=0.0
 for f in frames:average+=f
 average/=frames.size()
 var result={"label":label,"godot":Engine.get_version_info().string,"renderer":RenderingServer.get_video_adapter_name(),"profile":"LOW","viewport":[1280,720],"render_scale":root.scaling_3d_scale,"sample_frames":samples,"startup_to_playable_frame_ms":ready_ms,"frame_ms_mean":average,"frame_ms_p50":percentile(frames,.5),"frame_ms_p95":percentile(frames,.95),"uncapped_fps_from_mean":1000.0/maxf(.001,average),"draw_calls_median":percentile(draws,.5),"primitives_median":percentile(primitives,.5),"nodes":int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),"resources":int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),"static_memory_mb":Performance.get_monitor(Performance.MEMORY_STATIC)/1048576.0,"video_memory_mb":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)/1048576.0,"loaded_vehicles":game.vehicles.size(),"loaded_practice_actors":game.npcs.size(),"physics_bodies_3d":int(Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)),"note":"Uncapped native editor render capture; software/hardware host results are NOT a physical Android FPS guarantee."}
 var f=FileAccess.open(output,FileAccess.WRITE)
 if not f:push_error("Cannot write benchmark output");quit(1);return
 f.store_string(JSON.stringify(result,"  "));f.close();print("RENDER_BENCHMARK ",JSON.stringify(result))
 game.audio_node.shutdown();OS.delay_msec(120);call_deferred("finish")
func finish():quit(0)
