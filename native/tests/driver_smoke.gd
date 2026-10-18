extends SceneTree
# Integration regression: real game world + normal spawn + actual driver enter/exit, not a bare car body.
var failed=0
func check(value,label):
 if not value:failed+=1;push_error("DRIVER_ASSERT "+label)
func _initialize():call_deferred("run")
func run():
 var game=load("res://scenes/main.tscn").instantiate();root.add_child(game)
 for i in range(4):await physics_frame
 await game.start_game(false)
 for i in range(20):await physics_frame
 game.candidate=game._candidate();check(game.candidate!=null,"normal spawn has an accessible vehicle")
 if game.candidate==null:quit(1);return
 var car=game.candidate;var before=car.global_position
 print("DRIVER_BEFORE ",car.global_position," vehicle=",car.vehicle_id)
 game.interact();check(game.player.driving==car,"enter assigns driver")
 var minimum=1000.0;var maximum=-1000.0;var max_speed=0.0
 for i in range(120):
  await physics_frame;minimum=minf(minimum,car.global_position.y);maximum=maxf(maximum,car.global_position.y);max_speed=maxf(max_speed,car.linear_velocity.length())
 print("DRIVER_SETTLE ",car.global_position," minY=",minimum," maxY=",maximum," maxSpeed=",max_speed)
 check(minimum>-.2 and maximum<1.5,"occupied car stays on ground")
 check(max_speed<3,"entering a stationary car does not inject launch energy")
 check(car.global_position.distance_to(before)<4,"driver entry does not teleport/fall away")
 var point=car.safe_exit(game.player)
 check(point!=null,"safe exit remains reachable")
 if point!=null:game.player.exit_vehicle(point)
 for i in range(12):await physics_frame
 check(game.player.driving==null,"exit clears driver state")
 game.return_lobby();game.audio_node.shutdown()
 # Fixed-fps tests can finish hundreds of simulated frames before the real audio mixer wakes.
 # Drain stopped playback on the actual audio thread before destroying named WAV resources.
 OS.delay_msec(120)
 for i in range(2):await process_frame
 game.queue_free()
 for i in range(3):await process_frame
 for i in range(2):await physics_frame
 print("NATIVE_DRIVER_","PASS" if failed==0 else "FAIL"," failures=",failed)
 call_deferred("finish")
func finish():
 quit(0 if failed==0 else 1)
