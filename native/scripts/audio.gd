extends Node3D

var streams={}
var pool=[]
var index=0
var loops={}
var enabled=true
func _ready():
 for name in ["step_0","step_1","step_2","step_3","engine_idle","engine_mid","engine_high","skid","shot","impact","door","horn","siren","wind","rain","ui","land"]:
  streams[name]=load("res://assets/audio/"+name+".wav")
 for i in range(16):
  var p=AudioStreamPlayer3D.new();p.max_distance=55;p.unit_size=2.0;p.attenuation_model=AudioStreamPlayer3D.ATTENUATION_INVERSE_SQUARE_DISTANCE;add_child(p);pool.append(p)
func play_at(name,point,volume=0.0,pitch=1.0):
 if not enabled or not streams.has(name):return
 var p=pool[index%pool.size()];index+=1;p.stop();p.global_position=point;p.stream=streams[name];p.volume_db=volume;p.pitch_scale=pitch;p.play()
func start_loop(key,name,point,volume=-18.0):
 if not streams.has(name):return null
 if loops.has(key):return loops[key]
 var p=AudioStreamPlayer3D.new();var stream=streams[name].duplicate()
 if stream is AudioStreamWAV:stream.loop_mode=AudioStreamWAV.LOOP_FORWARD;stream.loop_begin=0;stream.loop_end=stream.data.size()/2
 p.stream=stream;p.volume_db=volume;p.max_distance=70;p.unit_size=3.0;add_child(p);p.global_position=point;p.play();loops[key]=p;return p
func stop_loop(key):
 if loops.has(key):loops[key].queue_free();loops.erase(key)
func engine(key,point,speed,throttle,active):
 if not active:stop_loop(key);return
 var p=start_loop(key,"engine_idle",point,-13)
 if p:p.global_position=point;p.pitch_scale=clampf(.85+absf(speed)*.065+absf(throttle)*.3,.8,3.5);p.volume_db=-18+absf(throttle)*5+minf(absf(speed),35)*.12
func set_volume(master):
 AudioServer.set_bus_volume_db(0,linear_to_db(clampf(master,0.001,1.0)))
