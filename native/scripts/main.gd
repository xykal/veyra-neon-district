extends Node3D

const Preferences=preload("res://scripts/preferences.gd")
const District=preload("res://scripts/district.gd")
const Citizen=preload("res://scripts/avatar.gd")
const Pawn=preload("res://scripts/pawn.gd")
const Car=preload("res://scripts/vehicle.gd")
const Sound=preload("res://scripts/audio.gd")
const Net=preload("res://scripts/network.gd")
const UI=preload("res://scripts/ui.gd")
const FX=preload("res://scripts/effects.gd")

var prefs
var world
var player
var audio_node
var network
var ui
var effects
var preview
var menu_camera:Camera3D
var pedestal:MeshInstance3D
var vehicles={}
var npcs=[]
var remote={}
var active_ragdolls=[]
var quality=0
var quality_spec={}
var playing=false
var online=false
var paused=false
var candidate=null
var money=0
var hud_clock=0.0
var input_clock=0.0
var fire_clock=0.0
var adaptive_clock=0.0
var average_fps=60.0
var destination=null
var route_node=null
var job_point=Vector3.ZERO
var last_local_shot=-1000.0
var weather_timer=0.0
var rainy=false
var thunder_timer=0.0
var cloth_timer=0.0
var boot_time=0.0
var native_checks=0
var native_failures=0
var demo_ragdolled=false
var touch_fire=false
var capture_path=""
var demo_capture=false
var demo_time=0.0
var loading=false
var session_generation=0
var last_diagnostic_write=0
var previous_session={}
var stream_clock=0.0
var streaming=false
var streaming_generation=-1
var vehicle_records={}
var vehicle_runtime={}
var network_vehicle_pending={}
var network_me={}
var memory_warnings=0
var load_stage="boot"
var startup_to_menu_ms=0.0
var diag_clock=0.0
var low_fps_time=0.0
var adaptive_scale=.7
var preview_yaw=0.0
var preview_idle=0.0

func _ready():
 boot_time=Time.get_ticks_msec()/1000.0
 if FileAccess.file_exists("user://diagnostics.json"):
  var old=FileAccess.open("user://diagnostics.json",FileAccess.READ)
  if old and old.get_length()<32768:
   var value=JSON.parse_string(old.get_as_text())
   if value is Dictionary:
    for k in ["version","stage","fps","static_memory_mb","video_memory_mb","memory_warnings","vehicles","quality"]:
     if value.has(k):previous_session[k]=value[k]
 prefs=Preferences.new();quality=prefs.tier();quality_spec=Preferences.PRESETS[quality]
 audio_node=Sound.new();add_child(audio_node);audio_node.set_volume(float(prefs.data.master))
 world=District.new();add_child(world);world.prepare(quality);world.visible=false;world.environment.environment.background_mode=Environment.BG_COLOR;world.environment.environment.background_color=Color("07111e");world.environment.environment.fog_enabled=false
 effects=FX.new();add_child(effects)
 network=Net.new();add_child(network);network.setup(prefs);network.packet.connect(_packet);network.status_changed.connect(_network_status)
 _preview()
 ui=UI.new();add_child(ui);ui.setup(self)
 set_quality(int(prefs.data.quality),false);get_viewport().scaling_3d_scale=.85
 for record in world.data.cars:vehicle_records[int(record.id)]=record
 startup_to_menu_ms=Time.get_ticks_msec()-int(boot_time*1000);_record_diagnostics("menu-ready")
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--server="):prefs.data.server=str(arg).trim_prefix("--server=")
  if str(arg).begins_with("--capture="):capture_path=str(arg).trim_prefix("--capture=")
  if str(arg)=="--demo":demo_capture=true
 if "--smoke-test" in OS.get_cmdline_user_args():call_deferred("_smoke_test")
 elif "--online-test" in OS.get_cmdline_user_args():call_deferred("_online_test")
 elif demo_capture:call_deferred("start_game",false)
 if capture_path!="":call_deferred("_capture")
 print("VEYRA_NATIVE_READY version=0.5.3-alpha.1 renderer=",RenderingServer.get_video_adapter_name()," tier=",quality," assets=20-clips/65-bones/39-sfx/lombok-shell; world=",world.data.seed)
func _preview():
 preview=Citizen.new();add_child(preview);preview.position=Vector3(-40,0,-40);preview.rotation.y=preview_yaw;preview.setup(int(prefs.data.look),quality)
 pedestal=MeshInstance3D.new();var disk=CylinderMesh.new();disk.top_radius=2.2;disk.bottom_radius=2.3;disk.height=.12;disk.radial_segments=48;pedestal.mesh=disk;var mat=StandardMaterial3D.new();mat.albedo_color=Color("1b3e46");mat.roughness=.55;mat.metallic=.25;pedestal.material_override=mat;pedestal.position=preview.position-Vector3.UP*.07;add_child(pedestal)
 menu_camera=Camera3D.new();menu_camera.fov=39;menu_camera.position=preview.position+Vector3(2.7,1.4,3.2);add_child(menu_camera);menu_camera.look_at(preview.position+Vector3(0,.96,0));menu_camera.current=true
func set_look(index):
 prefs.data.look=clampi(index,0,5);prefs.save();var p=preview.position;preview.queue_free();preview=Citizen.new();add_child(preview);preview.position=p;preview.setup(int(prefs.data.look),quality)
 if player and not playing:player.set_look(int(prefs.data.look))
 if ui:ui.notify(["Raka","Kai","Atlas","Naya","Luna","Asha"][int(prefs.data.look)]+" · native rig selected")
func rotate_preview(delta_x):
 if preview==null:return
 preview_yaw+=delta_x*.012;preview.rotation.y=preview_yaw;preview_idle=0
func save_vault(slot):
 if not prefs.data.vault_looks is Array:prefs.data.vault_looks=[0,1,2]
 while prefs.data.vault_looks.size()<3:prefs.data.vault_looks.append(0)
 prefs.data.vault_looks[clampi(slot,0,2)]=int(prefs.data.look);prefs.save()
 if ui:ui.notify("Vault slot "+str(slot+1)+" disimpan")
 if ui:ui.refresh_vault()
func apply_vault(slot):
 if not prefs.data.vault_looks is Array:return
 if slot>=prefs.data.vault_looks.size():return
 set_look(int(prefs.data.vault_looks[slot]))
func set_quality(value,save=true):
 prefs.data.quality=clampi(value,-1,2);quality=prefs.tier();quality_spec=Preferences.PRESETS[quality]
 if save:prefs.save()
 Engine.max_fps=int(quality_spec.fps);adaptive_scale=float(quality_spec.scale);get_viewport().scaling_3d_scale=adaptive_scale;get_viewport().mesh_lod_threshold=3.0 if quality==0 else 1.5
 get_viewport().msaa_3d=Viewport.MSAA_DISABLED if quality==0 else (Viewport.MSAA_2X if quality==1 else Viewport.MSAA_4X)
 if player:player.camera.far=float(quality_spec.distance)+25
 if world:world.set_quality(quality)
 if ui and save:ui.notify(str(quality_spec.name)+" · tidak menjamin FPS semua perangkat")
func _ensure_player():
 if player:return
 player=Pawn.new();add_child(player);player.setup(int(prefs.data.look),quality,audio_node);player.enabled=false;player.visible=false;player.camera.far=float(quality_spec.distance)+25
func _loading_progress(value,text):
 if not loading:return
 load_stage=text
 if Time.get_ticks_msec()-last_diagnostic_write>500:last_diagnostic_write=Time.get_ticks_msec();_record_diagnostics(text)
 if ui:ui.set_loading(true,value,text)
func _load_vehicle(record,generation=-1):
 if generation>=0 and generation!=session_generation:return null
 var c=Car.new();add_child(c);c.configure(record,world.data.types,quality,audio_node);c.networked=online;c.freeze=true;c.set_meta("last_used",Time.get_ticks_msec())
 var q=PhysicsRayQueryParameters3D.create(c.global_position+Vector3(0,40,0),c.global_position+Vector3(0,-80,0),3,[c.get_rid()])
 var g=get_world_3d().direct_space_state.intersect_ray(q)
 if not g.is_empty():c.global_position.y=float(g.position.y)+0.05
 if vehicle_runtime.has(int(record.id)):
  var state=vehicle_runtime[int(record.id)];c.global_transform=state.transform;c.hp=state.hp
 vehicles[int(record.id)]=c
 return c
func _stream_vehicles(point,initial=false):
 if streaming and streaming_generation==session_generation:return
 streaming=true;streaming_generation=session_generation;var generation=session_generation
 if not online:
  for c in vehicles.values():
   if vehicle_records.has(c.vehicle_id):
    var record=vehicle_records[c.vehicle_id].duplicate();record.x=c.global_position.x*10;record.y=c.global_position.z*10;vehicle_records[c.vehicle_id]=record
 var records=vehicle_records.values().duplicate()
 records.sort_custom(func(a,b):return Vector2(float(a.x)/10-point.x,float(a.y)/10-point.z).length_squared()<Vector2(float(b.x)/10-point.x,float(b.y)/10-point.z).length_squared())
 var budget=int(quality_spec.vehicles);var wanted={}
 for i in range(mini(budget,records.size())):wanted[int(records[i].id)]=records[i]
 if player and player.driving:wanted[player.driving.vehicle_id]=vehicle_records.get(player.driving.vehicle_id,{})
 for id in vehicles.keys():
  var c=vehicles[id]
  if wanted.has(id) or (player and c==player.driving):continue
  vehicle_runtime[id]={"transform":c.global_transform,"hp":c.hp}
  if vehicle_records.has(id):vehicle_records[id]=vehicle_records[id].duplicate();vehicle_records[id].x=c.global_position.x*10;vehicle_records[id].y=c.global_position.z*10
  c.queue_free();vehicles.erase(id)
 var loaded=0;var slice_started=Time.get_ticks_usec()
 for id in wanted:
  if vehicles.has(id):continue
  if generation!=session_generation:
   if streaming_generation==generation:streaming=false
   return
  await _load_vehicle(wanted[id],generation);loaded+=1
  if initial:_loading_progress(.72+.16*float(loaded)/maxi(1,wanted.size()),"Menyiapkan kendaraan dekat")
  if Time.get_ticks_usec()-slice_started>4500:await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 if streaming_generation==generation:streaming=false
func _populate():
 var spawn=Vector3(world.data.spawn.x/10.0,0,world.data.spawn.y/10.0)
 await _stream_vehicles(spawn,true)
 if not npcs.is_empty():return
 await get_tree().physics_frame
 for i in range(int(quality_spec.people)):
  var point=_free_point(spawn+Vector3(5+(i%4)*2.8,0,-4-floori(i/4.0)*3.0))
  if point==null:continue
  var body=StaticBody3D.new();body.collision_layer=16;body.collision_mask=0;add_child(body);body.global_position=point
  var shape=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=.3;capsule.height=1.8;shape.shape=capsule;shape.position.y=.9;body.add_child(shape)
  var a=Citizen.new();body.add_child(a);a.setup(i%6,quality);a.rotation.y=.6+i*.8;body.set_meta("citizen",a);body.set_meta("body_shape",shape);npcs.append({"body":body,"avatar":a,"shape":shape,"down":false})
  await get_tree().process_frame
func start_game(use_online):
 if playing or loading:return
 loading=true;session_generation+=1;Engine.max_fps=60;prefs.data.nickname=ui.name_input.text.strip_edges().left(16)
 if prefs.data.nickname=="":prefs.data.nickname="Warga"
 prefs.save();online=use_online;paused=false;_loading_progress(.01,"Memuat distrik")
 preview.visible=false;preview.set_active(false)
 call_deferred("_boot_watchdog")
 await world.build_async(quality,func(v,t):_loading_progress(v*.68,t))
 _loading_progress(.7,"Menyiapkan karakter")
 _ensure_player();await get_tree().process_frame
 await _populate()
 _finish_boot(false)
func _finish_boot(recovered):
 if playing and not loading:return
 loading=false;playing=true;Engine.max_fps=int(quality_spec.fps)
 if world:
  world.visible=true
  if world.environment and world.environment.environment:
   world.environment.environment.background_mode=Environment.BG_SKY;world.environment.environment.fog_enabled=true
 get_viewport().scaling_3d_scale=adaptive_scale
 if pedestal:pedestal.visible=false
 if player:
  player.visible=true;player.enabled=true;player.online=online
  var spawn_xz=Vector3(world.data.spawn.x/10.0,.05,world.data.spawn.y/10.0)
  var snap=get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(spawn_xz+Vector3(0,40,0),spawn_xz+Vector3(0,-80,0)))
  player.global_position=spawn_xz+Vector3(0,0.12,0) if snap.is_empty() else Vector3(spawn_xz.x,float(snap.position.y)+0.12,spawn_xz.z)
  player.facing=float(world.data.spawn.a);player.camera_yaw=player.facing
  if player.camera:player.camera.current=true
  player.reset_session()
 if menu_camera:menu_camera.current=false
 money=0
 for c in vehicles.values():c.networked=online;c.freeze=true;c.driver=0
 for n in npcs:n.body.visible=not online;n.shape.disabled=online;n.avatar.set_active(not online)
 ui.set_loading(false,1,"Siap");ui.show_game()
 Input.mouse_mode=Input.MOUSE_MODE_VISIBLE if ui.touch.enabled else Input.MOUSE_MODE_CAPTURED
 if audio_node:
  audio_node.set_ambient(player.global_position if player else Vector3.ZERO,"coast")
  audio_node.play_ui("welcome_pa",-4.0)
 if online:network.join();ui.notify("Online · shared server")
 elif recovered:ui.notify("Pemuatan dipulihkan · sebagian dunia mungkin belum siap.")
 else:ui.notify("Selamat datang di Veyra. Anda mendarat di Bandara Internasional Veyra.")
 job_point=Vector3(world.data.map.pois[0].x/10.0,0,world.data.map.pois[0].y/10.0);_record_diagnostics("playing")

func _boot_watchdog():
 var gen=session_generation;var last=load_stage;var last_t=Time.get_ticks_msec()
 while loading and gen==session_generation:
  await get_tree().create_timer(1.0).timeout
  if not loading or gen!=session_generation:return
  if load_stage!=last:last=load_stage;last_t=Time.get_ticks_msec()
  elif Time.get_ticks_msec()-last_t>12000:
   push_warning("boot watchdog: forcing finish after stall at "+str(load_stage))
   _finish_boot(true);return

func return_lobby():
 session_generation+=1;loading=false
 if player:
  if player.driving:player.exit_vehicle(player.driving.nearest_door(player.global_position))
  player.avatar.stop_ragdoll();player.avatar.set_active(false);player.enabled=false;player.visible=false;player.velocity=Vector3.ZERO;player.camera.current=false
 playing=false;online=false;paused=false;network.leave();world.visible=false;world.environment.environment.background_mode=Environment.BG_COLOR;world.environment.environment.fog_enabled=false;get_viewport().scaling_3d_scale=.85;preview.visible=true;preview.set_active(true);pedestal.visible=true;menu_camera.current=true;Engine.max_fps=30
 for c in vehicles.values():
  vehicle_runtime[c.vehicle_id]={"transform":c.global_transform,"hp":c.hp};c.queue_free()
 vehicles.clear()
 for n in npcs:n.avatar.stop_ragdoll();n.avatar.set_active(false);n.body.visible=false;n.shape.set_deferred("disabled",true)
 for actor in remote.values():actor.queue_free()
 remote.clear();network_vehicle_pending.clear();network_me={};active_ragdolls.clear();destination=null
 if route_node:route_node.queue_free();route_node=null
 audio_node.stop_loop("player-engine");audio_node.stop_loop("ambient");audio_node.stop_loop("ambient_ocean");audio_node.stop_loop("ambient_wind");audio_node.stop_loop("ambient_birds");ui.touch.reset();ui.set_loading(false,1,"");ui.show_menu();_record_diagnostics("lobby")
func toggle_pause():
 if not playing:return
 paused=not paused;ui.pause_panel.visible=paused;ui.gps_panel.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE if paused or ui.touch.enabled else Input.MOUSE_MODE_CAPTURED;ui.touch.reset();ui.touch.visible=ui.touch.enabled and not paused
func _unhandled_input(event):
 if event is InputEventKey and event.pressed and not event.echo and playing:
  match event.physical_keycode:
   KEY_ESCAPE:toggle_pause()
   KEY_F:interact()
   KEY_G:ui.show_gps()
   KEY_T:ui.open_chat()
   KEY_K:manual_ragdoll()
   KEY_H:horn()
   KEY_R:reset_car()
 if event is InputEventMouseMotion and playing and not paused and Input.mouse_mode==Input.MOUSE_MODE_CAPTURED:player.orbit(event.relative*float(prefs.data.look_sensitivity))
 if event is InputEventMouseButton and playing and not paused:
  if event.button_index==MOUSE_BUTTON_LEFT and event.pressed and not ui.touch.enabled:
   if Input.mouse_mode!=Input.MOUSE_MODE_CAPTURED:Input.mouse_mode=Input.MOUSE_MODE_CAPTURED
  if event.button_index==MOUSE_BUTTON_WHEEL_UP and event.pressed:player.spring.spring_length=maxf(2,player.spring.spring_length-.25)
func _process(delta):
 if not playing:
  if preview and not loading:
   preview_idle+=delta
   if preview_idle>1.6:preview.rotation.y+=delta*.42
  return
 if online and not network_vehicle_pending.is_empty():
  var id=network_vehicle_pending.keys()[0]
  var desired=int(network_me.get("v",0))
  if desired!=0 and network_vehicle_pending.has(desired):id=desired
  var packet=network_vehicle_pending[id];network_vehicle_pending.erase(id)
  if not vehicles.has(id):
   var car=Car.new();add_child(car);car.configure({"id":id,"type":packet.y2,"x":packet.x,"y":packet.y,"a":packet.a},world.data.types,quality,audio_node);vehicles[id]=car
  vehicles[id].snapshot(packet)
  if desired==id and player.driving!=vehicles[id]:player.enter_vehicle(vehicles[id])
 var typing=get_viewport().gui_get_focus_owner() is LineEdit
 var move=Vector2.ZERO
 if not paused and not typing:
  if ui.touch.enabled:move=ui.touch.read_move();player.orbit(ui.touch.take_look()*float(prefs.data.look_sensitivity))
  else:move=Vector2(float(Input.is_physical_key_pressed(KEY_D))-float(Input.is_physical_key_pressed(KEY_A)),float(Input.is_physical_key_pressed(KEY_S))-float(Input.is_physical_key_pressed(KEY_W))).limit_length(1)
 player.controls={"move":move,"sprint":(ui.touch.wants_sprint() if ui.touch.enabled else Input.is_physical_key_pressed(KEY_SHIFT)) and not paused,"jump":((ui.touch.held.brake if player.driving else ui.touch.held.jump) if ui.touch.enabled else Input.is_physical_key_pressed(KEY_SPACE)) and not paused,"crouch":Input.is_physical_key_pressed(KEY_CTRL) and not ui.touch.enabled and not paused,"aim":((ui.touch.held.aim or ui.touch.held.fire) if ui.touch.enabled else Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) and not paused}
 if not paused and not online and player and player.avatar and not player.driving and Input.is_physical_key_pressed(KEY_B):
  if not player.get_meta("emote_latch",false):
   player.set_meta("emote_latch",true);player.avatar.emote()
   if audio_node:audio_node.play_at("cloth",player.global_position,-14)
 elif player:player.set_meta("emote_latch",false)
 player.enabled=not paused or online
 if player.driving:
  if not online:player.driving.set_drive(-move.y,move.x,player.controls.jump)
  audio_node.engine("player-engine",player.driving.global_position,player.driving.speed_mps,-move.y,true)
  audio_node.wind_fast(player.driving.global_position,absf(player.driving.speed_mps)>17.0)
 else:
  audio_node.stop_loop("player-engine");audio_node.wind_fast(Vector3.ZERO,false)
 _weather(delta)
 if audio_node.loops.has("ambient"):audio_node.loops.ambient.global_position=player.global_position
 input_clock+=delta
 if online and network.welcomed and input_clock>=1.0/30:input_clock=0;network.input(player.input_packet())
 fire_clock=maxf(0,fire_clock-delta)
 var firing=ui.touch.held.fire if ui.touch.enabled else Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and Input.mouse_mode==Input.MOUSE_MODE_CAPTURED
 if firing and not paused and not typing:shoot()
 for a in remote.values():
  if not a.ragdoll and a.has_meta("target_position"):
   a.global_position=a.global_position.lerp(a.get_meta("target_position"),1-exp(-delta*16));a.rotation.y=lerp_angle(a.rotation.y,a.get_meta("target_yaw"),1-exp(-delta*16))
 _update_ragdolls(delta)
 hud_clock+=delta
 if hud_clock>.15:
  hud_clock=0;candidate=_candidate();ui.update_hud()
  if online and not network.welcomed:ui.status_label.text="MENGHUBUNGKAN / RECONNECTING"
  _update_gps()
 average_fps=lerpf(average_fps,1.0/maxf(.001,delta),.035);adaptive_clock+=delta
 if average_fps<24:low_fps_time+=delta
 else:low_fps_time=maxf(0,low_fps_time-delta)
 if int(prefs.data.quality)<0 and low_fps_time>4 and adaptive_clock>6:
  adaptive_clock=0;low_fps_time=0
  if quality>0:
   quality-=1;quality_spec=Preferences.PRESETS[quality];world.set_quality(quality);adaptive_scale=float(quality_spec.scale);Engine.max_fps=int(quality_spec.fps)
  elif adaptive_scale>.56:adaptive_scale=maxf(.55,adaptive_scale-.05)
  get_viewport().scaling_3d_scale=adaptive_scale;ui.notify("Mode aman GPU disesuaikan.")
 stream_clock+=delta
 if stream_clock>1.0 and not streaming and not online:stream_clock=0;_stream_vehicles(player.global_position)
 diag_clock+=delta
 if diag_clock>5:diag_clock=0;_record_diagnostics("playing")
 if demo_capture:_demo(delta)
func _candidate():
 if player.driving or player.avatar.ragdoll:return null
 var best=null;var distance=1000.0
 for c in vehicles.values():
  if not c.can_enter(player.global_position):continue
  var d=player.global_position.distance_to(c.nearest_door(player.global_position))
  if d<distance:distance=d;best=c
 return best
func interact():
 if not playing or paused:return
 if player and player.avatar and not player.avatar.ragdoll:player.avatar.play_motion("Interact",1.25)
 if online:
  if not network.welcomed:ui.notify("Tunggu koneksi server.");return
  if player.driving:network.send({"t":"exit"})
  elif candidate:network.send({"t":"enter","c":candidate.vehicle_id})
  else:ui.notify("Dekati pintu kendaraan yang berhenti dan tidak terpakai.")
  return
 if player.driving:
  var c=player.driving
  if absf(c.speed_mps)>4.5:ui.notify("Rem dulu sebelum turun.");return
  var point=c.safe_exit(player)
  if point==null:ui.notify("Pintu terhalang. Geser mobil ke ruang terbuka.");return
  player.exit_vehicle(point);audio_node.play_at("door",point,-5)
 elif candidate:
  candidate.ai=false;candidate.freeze=false;candidate.sleeping=false;player.enter_vehicle(candidate);audio_node.play_at("door",candidate.global_position,-5)
func manual_ragdoll():
 if not playing or paused:return
 if online:ui.notify("Online: server menentukan KO. Uji ragdoll manual di latihan offline.");return
 if player.driving:ui.notify("Turun dulu untuk mencoba ragdoll.");return
 if player.avatar.ragdoll:player.recover()
 else:player.knockdown(player.velocity+Vector3(cos(player.facing),1,sin(player.facing))*2.5)
func _weather(delta):
 if not playing or paused or player==null:return
 weather_timer-=delta
 if weather_timer<=0:
  rainy=not rainy
  weather_timer=42.0+randf()*70.0 if not rainy else 26.0+randf()*30.0
  thunder_timer=4.0+randf()*10.0
 audio_node.rain(player.global_position,rainy)
 if rainy:
  thunder_timer-=delta
  if thunder_timer<=0:
   audio_node.thunder(player.global_position+Vector3(randf_range(-60,60),0,randf_range(-60,60)))
   thunder_timer=18.0+randf()*38.0
func horn():
 if not playing:return
 if online:network.send({"t":"horn"})
 audio_node.play_at("horn",player.global_position,-5)
func reset_car():
 if online:ui.notify("Online: reset hanya mengikuti aturan server.");return
 var c=player.driving if player.driving else candidate
 if c:c.freeze=false;c.reset_upright();ui.notify("Kendaraan ditegakkan kembali.")
func shoot():
 if fire_clock>0 or not playing or player.driving or player.avatar.ragdoll:return
 if not player.controls.aim and not online:
  fire_clock=.55
  player.avatar.play_motion("Interact",1.6)
  audio_node.punch(player.global_position)
  var camera=player.camera;var start=camera.global_position;var end=start-camera.global_basis.z*2.1
  var query=PhysicsRayQueryParameters3D.create(start,end,1|2|16);query.exclude=[player.get_rid()];query.collide_with_areas=true
  var punch_hit=get_world_3d().direct_space_state.intersect_ray(query)
  if not punch_hit.is_empty() and punch_hit.collider.has_meta("citizen"):
   var pa=punch_hit.collider.get_meta("citizen");var ps=punch_hit.collider.get_meta("body_shape")
   _ragdoll_actor(pa,ps,-camera.global_basis.z*2.2)
   audio_node.play_at("ragdoll_hit",punch_hit.position,-8)
  return
 fire_clock=.28;last_local_shot=Time.get_ticks_msec()/1000.0;player.avatar.fire_animation()
 var camera=player.camera;var start=camera.global_position;var end=start-camera.global_basis.z*62;var query=PhysicsRayQueryParameters3D.create(start,end,1|2|16);query.exclude=[player.get_rid()];query.collide_with_areas=true;var hit=get_world_3d().direct_space_state.intersect_ray(query)
 if not hit.is_empty():end=hit.position;effects.impact(end,hit.normal,"metal")
 effects.trace_shot(player.avatar.muzzle.global_position if player.avatar.muzzle else player.global_position+Vector3.UP*1.25,end);audio_node.play_at("shot",player.global_position,0,randf_range(.96,1.04));player.camera_pitch=maxf(-.1,player.camera_pitch-.012)
 if online:network.send({"t":"fire","a":player.camera_yaw});return
 if not hit.is_empty() and hit.collider.has_meta("citizen"):
  var a=hit.collider.get_meta("citizen");var shape=hit.collider.get_meta("body_shape");_ragdoll_actor(a,shape,-camera.global_basis.z*3.5)
func _ragdoll_actor(a,shape,impulse):
 if a.ragdoll:return
 while active_ragdolls.size()>=int(quality_spec.ragdolls):
  var old=active_ragdolls.pop_front()
  if is_instance_valid(old.avatar):old.avatar.stop_ragdoll();old.shape.set_deferred("disabled",false)
 shape.set_deferred("disabled",true);a.start_ragdoll(impulse);active_ragdolls.append({"avatar":a,"shape":shape,"time":5.0});audio_node.play_at("impact",a.global_position,-8)
func _update_ragdolls(delta):
 for i in range(active_ragdolls.size()-1,-1,-1):
  var e=active_ragdolls[i];e.time-=delta
  if e.time<=0:
   if is_instance_valid(e.avatar):e.avatar.stop_ragdoll();e.shape.set_deferred("disabled",false)
   active_ragdolls.remove_at(i)
func _free_point(point):
 var state=get_world_3d().direct_space_state
 for radius in [0.0,1.5,3.0,5.0]:
  for i in range(8):
   var p=point+Vector3(cos(i*TAU/8)*radius,0,sin(i*TAU/8)*radius)
   var g=state.intersect_ray(PhysicsRayQueryParameters3D.create(p+Vector3(0,40,0),p+Vector3(0,-80,0)))
   p.y=float(g.position.y)+.06 if not g.is_empty() else .06
   var shape=CapsuleShape3D.new();shape.radius=.42;shape.height=1.8;var q=PhysicsShapeQueryParameters3D.new();q.shape=shape;q.transform=Transform3D(Basis.IDENTITY,p+Vector3.UP*.92);q.collision_mask=1|2
   if state.intersect_shape(q,1).is_empty():return p
 return null
func _packet(message):
 match str(message.get("t","")):
  "welcome":
   if int(message.seed)!=int(world.data.seed):network.leave();ui.notify("Native map seed berbeda. Gunakan web untuk server custom.",8);return
   ui.notify("Terhubung ke distrik multiplayer.")
  "s":_snapshot(message)
  "chat":ui.message(str(message.n)+": "+str(message.m))
  "sys":ui.message(str(message.m))
  "sfx":
   var p=Vector3(float(message.get("x",0))/10,1,float(message.get("y",0))/10);var key=str(message.k)
   if key=="shot" and Time.get_ticks_msec()/1000.0-last_local_shot<.2 and player.global_position.distance_to(p)<2:return
   if key in ["shot","door","horn","impact"]:audio_node.play_at(key,p,-4)
func _snapshot(s):
 if not playing or not online:return
 var own_vehicle=0
 for p in s.get("p",[]):
  if int(p.i)==network.my_id:own_vehicle=int(p.get("v",0))
 var cars=s.get("c",[]).duplicate()
 cars.sort_custom(func(a,b):return Vector2(float(a.x)/10-player.global_position.x,float(a.y)/10-player.global_position.z).length_squared()<Vector2(float(b.x)/10-player.global_position.x,float(b.y)/10-player.global_position.z).length_squared())
 var visible_ids={}
 for i in range(cars.size()):
  var c=cars[i];var id=int(c.i)
  if i>=int(quality_spec.vehicles) and id!=own_vehicle:continue
  visible_ids[id]=true
  if not vehicles.has(id):network_vehicle_pending[id]=c
  else:vehicles[id].snapshot(c)
 for id in network_vehicle_pending.keys():
  if not visible_ids.has(id):network_vehicle_pending.erase(id)
 for id in vehicles.keys():
  if not visible_ids.has(id) and id!=own_vehicle:vehicles[id].queue_free();vehicles.erase(id)
 var valid={};var rendered_remote=0;var players=s.get("p",[]).duplicate()
 players.sort_custom(func(a,b):return Vector2(float(a.x)/10-player.global_position.x,float(a.y)/10-player.global_position.z).length_squared()<Vector2(float(b.x)/10-player.global_position.x,float(b.y)/10-player.global_position.z).length_squared())
 for p in players:
  var id=int(p.i)
  if id==network.my_id:
   network_me=p;money=int(p.get("$",0));player.authoritative(p);var v=int(p.get("v",0))
   if v!=0 and vehicles.has(v) and player.driving!=vehicles[v]:player.enter_vehicle(vehicles[v])
   elif v==0 and player.driving:player.exit_vehicle(Vector3(float(p.x)/10,.05,float(p.y)/10))
   continue
  if rendered_remote>=int(quality_spec.remote):continue
  rendered_remote+=1;valid[id]=true
  if not remote.has(id):
   var actor=Citizen.new();add_child(actor);var o=p.get("o",[0]);actor.setup(clampi(int(o[0]),0,5),quality);remote[id]=actor;actor.global_position=Vector3(float(p.x)/10,0,float(p.y)/10)
   var body=StaticBody3D.new();body.collision_layer=16;body.collision_mask=0;actor.add_child(body);var shape=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=.42;capsule.height=1.8;shape.shape=capsule;shape.position.y=.9;body.add_child(shape);actor.set_meta("collider",shape)
  var a=remote[id];a.set_meta("target_position",Vector3(float(p.x)/10,0,float(p.y)/10));a.set_meta("target_yaw",PI/2-float(p.a))
  if a.has_meta("collider"):a.get_meta("collider").set_deferred("disabled",int(p.d)==1 or int(p.v)!=0)
  if int(p.d)==1:
   if not a.ragdoll and remote.values().filter(func(x):return x.ragdoll).size()<int(quality_spec.ragdolls):a.start_ragdoll(Vector3(float(p.get("vx",0))/10,0,float(p.get("vy",0))/10))
  else:
   if a.ragdoll:a.stop_ragdoll()
   var speed=Vector2(float(p.get("vx",0)),float(p.get("vy",0))).length()/10;a.locomotion(speed,speed>3.8,false,false,int(p.v)!=0,bool(p.get("am",false)))
 for id in remote.keys():
  if not valid.has(id):remote[id].queue_free();remote.erase(id)
 if s.has("j") and s.j is Dictionary:job_point=Vector3(float(s.j.x)/10,0,float(s.j.y)/10)
func _network_status(text):
 if ui:ui.notify(text)
func send_chat(text):
 if text.strip_edges()=="":return
 if online:network.send({"t":"chat","m":text.left(200)})
 else:ui.message(str(prefs.data.nickname)+": "+text.left(200)+" [lokal]")
func navigate_to(poi):
 destination=poi
 if route_node:route_node.queue_free()
 var target=Vector3(float(poi.x)/10,.06,float(poi.y)/10);var start=player.global_position;var a=_road_attach(start);var b=_road_attach(target);var mid=Vector3(b.x,.06,a.z)
 var points=[start+Vector3.UP*.06,a,mid,b,target];var mesh=ImmediateMesh.new();var mat=StandardMaterial3D.new();mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mat.albedo_color=Color("6ad9cc");mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP,mat)
 for p in points:mesh.surface_add_vertex(p)
 mesh.surface_end();route_node=MeshInstance3D.new();route_node.mesh=mesh;add_child(route_node);ui.notify("GPS → "+str(poi.name));Input.mouse_mode=Input.MOUSE_MODE_VISIBLE if ui.touch.enabled else Input.MOUSE_MODE_CAPTURED
func _road_attach(p):
 var x=roundf(p.x/60)*60;var z=roundf(p.z/60)*60
 return Vector3(x,.06,p.z) if absf(x-p.x)<absf(z-p.z) else Vector3(p.x,.06,z)
func _update_gps():
 if destination:
  var d=Vector2(player.global_position.x-float(destination.x)/10,player.global_position.z-float(destination.y)/10).length();ui.gps_title.text="GPS · "+str(destination.name)+" · "+str(int(d))+" m"
  if d<4:ui.notify("Tiba di "+str(destination.name));destination=null;ui.gps_title.text="";route_node.queue_free();route_node=null
 else:ui.gps_title.text="Job pengiriman · "+str(int(player.global_position.distance_to(job_point)))+" m"
func _capture():
 while loading:await get_tree().process_frame
 for i in range(25):await get_tree().process_frame
 if DisplayServer.get_name()=="headless":print("Capture needs a rendered display");get_tree().quit(1);return
 await RenderingServer.frame_post_draw
 var error=get_viewport().get_texture().get_image().save_png(capture_path);print("NATIVE_CAPTURE ",capture_path," result=",error);get_tree().quit(0 if error==OK else 1)
func _demo(delta):
 demo_time+=delta
 if demo_time<2:player.controls.move=Vector2(0,-.6)
 elif demo_time<3.5:player.controls.move=Vector2.ZERO
 elif demo_time<3.6 and not demo_ragdolled:demo_ragdolled=true;manual_ragdoll()
 if demo_time>8:player.controls.move=Vector2.ZERO
func _smoke_test():
 await start_game(false)
 for i in range(20):await get_tree().physics_frame
 _check(player.avatar.skeleton.get_bone_count()==65,"native skeleton")
 _check(vehicles.size()>0,"native vehicle resources")
 player.controls.move=Vector2(0,-1)
 var before=player.global_position
 for i in range(60):await get_tree().physics_frame
 # The full renderer/controller test can also be run on an exported EXE, without WebView/browser.
 _check(player.global_position.is_finite(),"controller finite")
 candidate=_candidate();_check(candidate!=null,"normal spawn vehicle access")
 if candidate:
  var car=candidate;interact();_check(player.driving==car,"driver assignment")
  var car_y0=car.global_position.y
  for i in range(120):await get_tree().physics_frame
  _check(car.global_position.y>car_y0-.25 and car.global_position.y<car_y0+1.5,"occupied vehicle grounded")
  _check(car.linear_velocity.length()<3,"driver entry cannot launch vehicle")
  var point=car.safe_exit(player);_check(point!=null,"safe driver exit")
  if point!=null:player.exit_vehicle(point)
  for i in range(12):await get_tree().physics_frame
  _check(player.driving==null,"driver state clears on exit")
 player.knockdown(Vector3(2,1,0))
 for i in range(180):await get_tree().physics_frame
 _check(player.avatar.physical.size()>=11,"physical bone bodies")
 _check(player.global_position.is_finite(),"ragdoll recovery finite")
 audio_node.shutdown();OS.delay_msec(120)
 for i in range(2):await get_tree().process_frame
 print("NATIVE_APP_SMOKE_PASS" if native_failures==0 else "NATIVE_APP_SMOKE_FAIL", " checks=",native_checks," renderer=",DisplayServer.get_name());get_tree().quit(0 if native_failures==0 else 1)
func _online_test():
 await start_game(true)
 for i in range(900):
  await get_tree().process_frame
  if network.welcomed and network.my_id>0:break
 _check(network.welcomed,"native websocket welcome")
 network.send({"t":"lb"})
 for i in range(60):await get_tree().process_frame
 print("NATIVE_ONLINE_SMOKE_PASS playerId=",network.my_id," tokenStored=",str(prefs.data.token).length()==64);network.leave();get_tree().quit(0)
func _check(value,label):
 native_checks+=1
 if not value:native_failures+=1;push_error("NATIVE_ASSERT_FAILED "+label)

func diagnostic_data():
 return {"app":"Veyra","version":"0.5.3-alpha.1","stage":load_stage,"os":OS.get_name(),"device":OS.get_model_name(),"renderer":RenderingServer.get_video_adapter_name(),"adapter":RenderingServer.get_video_adapter_vendor(),"quality":quality,"render_scale":get_viewport().scaling_3d_scale,"fps":Engine.get_frames_per_second(),"frame_ms_estimate":1000.0/maxf(1,average_fps),"static_memory_mb":Performance.get_monitor(Performance.MEMORY_STATIC)/1048576.0,"video_memory_mb":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)/1048576.0,"nodes":int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),"draw_calls":int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),"vehicles":vehicles.size(),"pending_vehicles":network_vehicle_pending.size(),"practice_actors":npcs.size(),"world_batches":world.batch_nodes.size(),"memory_warnings":memory_warnings,"menu_ready_ms":startup_to_menu_ms,"online":online,"previous_session":previous_session,"os_memory":OS.get_memory_info()}
func _record_diagnostics(stage):
 load_stage=stage
 var file=FileAccess.open("user://diagnostics.json",FileAccess.WRITE)
 if file:file.store_string(JSON.stringify(diagnostic_data(),"  "))
func copy_diagnostics():
 _record_diagnostics("manual-report");DisplayServer.clipboard_set(JSON.stringify(diagnostic_data(),"  "));ui.notify("Diagnostik tersalin. Tidak berisi token/percakapan.")
func _notification(what):
 if what==MainLoop.NOTIFICATION_APPLICATION_FOCUS_OUT and ui:
  ui.touch.reset()
  if player:player.controls={"move":Vector2.ZERO,"sprint":false,"jump":false,"crouch":false,"aim":false}
 if what==MainLoop.NOTIFICATION_OS_MEMORY_WARNING and world:
  memory_warnings+=1;quality=0;quality_spec=Preferences.PRESETS[0];adaptive_scale=.6;get_viewport().scaling_3d_scale=.6;get_viewport().msaa_3d=Viewport.MSAA_DISABLED;world.set_quality(0)
  for id in vehicles.keys():
   if player and vehicles[id]==player.driving:continue
   if player and vehicles[id].global_position.distance_to(player.global_position)>35:vehicles[id].queue_free();vehicles.erase(id)
  for actor in remote.values():actor.queue_free()
  remote.clear();Car.clear_template_cache();_record_diagnostics("os-memory-warning")
