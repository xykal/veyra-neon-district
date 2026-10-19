extends Node3D

const STREAMS=[
 "step_0","step_1","step_2","step_3","step_concrete","step_grass","step_dirt","step_sand",
 "engine_idle","engine_mid","engine_high","engine_start","engine_stop","engine_key",
 "skid","brake","scrape","shot","impact","punch","ragdoll_hit","door","horn","siren",
 "jump","land","land_hard","cloth","wind","wind_high","rain","thunder","ocean","birds",
 "ui","ui_confirm","ui_back","ui_level","welcome_pa"
]
var streams={}
var pool=[]
var index=0
var loops={}
var enabled=true
var surface_cycle=0
func _ready():
 for name in STREAMS:
  var path="res://assets/audio/"+name+".wav"
  if ResourceLoader.exists(path):streams[name]=load(path)
 for i in range(16):
  var p=AudioStreamPlayer3D.new();p.max_distance=55;p.unit_size=2.0;p.attenuation_model=AudioStreamPlayer3D.ATTENUATION_INVERSE_SQUARE_DISTANCE;add_child(p);pool.append(p)
func play_at(name,point,volume=0.0,pitch=1.0):
 if not enabled or not streams.has(name):return
 var p=pool[index%pool.size()];index+=1;p.stop();p.global_position=point;p.stream=streams[name];p.volume_db=volume;p.pitch_scale=pitch;p.play()
func play_ui(name="ui",volume=-10.0):
 if not enabled or not streams.has(name):return
 var p=pool[index%pool.size()];index+=1;p.stop();p.global_position=Vector3.ZERO;p.stream=streams[name];p.volume_db=volume;p.pitch_scale=1;p.play()
func footstep(point,surface="concrete",intensity=1.0):
 surface_cycle=(surface_cycle+1)%2
 var name="step_concrete"
 if surface=="grass":name="step_grass"
 elif surface=="dirt":name="step_dirt"
 elif surface=="sand":name="step_sand"
 elif surface=="generic":name="step_"+str(randi()%4)
 play_at(name,point,-11+6*clampf(intensity,0,1),randf_range(.92,1.08))
func jump(point):play_at("jump",point,-8,randf_range(.96,1.05))
func land(point,intensity=1.0):play_at("land_hard" if intensity>1.25 else "land",point,-6+4*clampf(intensity-1,0,1),randf_range(.94,1.04))
func vehicle_enter(point):play_at("engine_key",point,-8);play_at("door",point,-6)
func vehicle_exit(point):play_at("door",point,-6)
func brake(point,intensity=1.0):play_at("brake",point,-12+8*clampf(intensity,0,1),randf_range(.94,1.06))
func impact(point,intensity=1.0):play_at("impact",point,-6+5*clampf(intensity,0,1),clampf(1.2-intensity*.18,.65,1.25))
func punch(point):play_at("punch",point,-8,randf_range(.95,1.06))
func ragdoll(point):play_at("ragdoll_hit",point,-9,randf_range(.92,1.08))
func start_loop(key,name,point,volume=-18.0):
 if not streams.has(name):return null
 if loops.has(key):return loops[key]
 var p=AudioStreamPlayer3D.new();var stream=streams[name].duplicate()
 if stream is AudioStreamWAV:stream.loop_mode=AudioStreamWAV.LOOP_FORWARD;stream.loop_begin=0;stream.loop_end=stream.data.size()/2
 p.stream=stream;p.volume_db=volume;p.max_distance=70;p.unit_size=3.0;add_child(p);p.global_position=point;p.play();loops[key]=p;return p
func stop_loop(key):
 if loops.has(key):loops[key].stop();loops[key].stream=null;loops[key].queue_free();loops.erase(key)
func engine(key,point,speed,throttle,active):
 if not active:
  if loops.has(key):play_at("engine_stop",point,-9)
  stop_loop(key);return
 var src="engine_idle"
 if absf(speed)>12.0:src="engine_high"
 elif absf(speed)>4.5:src="engine_mid"
 if not loops.has(key) or loops[key].get_meta("src","")!=src:
  stop_loop(key)
  var p=start_loop(key,src,point,-13)
  if p:p.set_meta("src",src)
 var player=loops.get(key)
 if player:
  player.global_position=point
  player.pitch_scale=clampf(.85+absf(speed)*.045+absf(throttle)*.22,.85,2.6)
  player.volume_db=-18+absf(throttle)*5+minf(absf(speed),35)*.12
func engine_start(key,point):
 play_at("engine_start",point,-7)
func siren(key,point,active):
 if active:
  if not loops.has(key):start_loop(key,"siren",point,-16)
  elif loops[key]:loops[key].global_position=point
 else:stop_loop(key)
func rain(point,active):
 if active:
  if not loops.has("weather_rain"):start_loop("weather_rain","rain",point,-26)
  elif loops["weather_rain"]:loops["weather_rain"].global_position=point
 else:stop_loop("weather_rain")
func thunder(point):
 play_at("thunder",point,-8,randf_range(.9,1.05))
func cloth(point):
 play_at("cloth",point,-16,randf_range(.92,1.1))
func wind_fast(point,active):
 if active:
  if not loops.has("wind_fast"):start_loop("wind_fast","wind_high",point,-20)
  elif loops["wind_fast"]:loops["wind_fast"].global_position=point
 else:stop_loop("wind_fast")
func set_ambient(point,mode="coast"):
 if mode=="coast":
  start_loop("ambient_ocean","ocean",point,-30)
  start_loop("ambient_wind","wind",point,-32)
  if not loops.has("ambient_birds") and randf()>.35:start_loop("ambient_birds","birds",point,-34)
 else:
  start_loop("ambient_wind","wind",point,-32)
func set_volume(master):
 AudioServer.set_bus_volume_db(0,linear_to_db(clampf(master,0.001,1.0)))
func shutdown():
 for p in pool:
  if is_instance_valid(p):p.stop();p.stream=null
 for p in loops.values():
  if is_instance_valid(p):p.stop();p.stream=null
 loops.clear();streams.clear()
func _exit_tree():
 shutdown()
