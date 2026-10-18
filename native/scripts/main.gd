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
var boot_time=0.0
var native_checks=0
var native_failures=0
var demo_ragdolled=false
var touch_fire=false
var capture_path=""
var demo_capture=false
var demo_time=0.0

func _ready():
 boot_time=Time.get_ticks_msec()/1000.0;prefs=Preferences.new();quality=prefs.tier();quality_spec=Preferences.PRESETS[quality]
 audio_node=Sound.new();add_child(audio_node);audio_node.set_volume(float(prefs.data.master))
 world=District.new();add_child(world);world.build(quality);world.visible=false;world.environment.environment.background_mode=Environment.BG_COLOR;world.environment.environment.background_color=Color("07111e");world.environment.environment.fog_enabled=false
 effects=FX.new();add_child(effects)
 player=Pawn.new();add_child(player);player.setup(int(prefs.data.look),quality,audio_node);player.enabled=false;player.visible=false
 network=Net.new();add_child(network);network.setup(prefs);network.packet.connect(_packet);network.status_changed.connect(_network_status)
 _preview()
 ui=UI.new();add_child(ui);ui.setup(self)
 set_quality(int(prefs.data.quality),false);get_viewport().scaling_3d_scale=1.0
 for arg in OS.get_cmdline_user_args():
  if str(arg).begins_with("--server="):prefs.data.server=str(arg).trim_prefix("--server=")
  if str(arg).begins_with("--capture="):capture_path=str(arg).trim_prefix("--capture=")
  if str(arg)=="--demo":demo_capture=true
 if "--smoke-test" in OS.get_cmdline_user_args():call_deferred("_smoke_test")
 elif "--online-test" in OS.get_cmdline_user_args():call_deferred("_online_test")
 elif demo_capture:call_deferred("start_game",false)
 if capture_path!="":call_deferred("_capture")
 print("VEYRA_NATIVE_READY version=0.4.0-alpha renderer=",RenderingServer.get_video_adapter_name()," tier=",quality," assets=20-clips/65-bones; world=",world.data.seed)
func _preview():
 preview=Citizen.new();add_child(preview);preview.position=Vector3(-40,0,-40);preview.setup(int(prefs.data.look),quality)
 pedestal=MeshInstance3D.new();var disk=CylinderMesh.new();disk.top_radius=2.2;disk.bottom_radius=2.3;disk.height=.12;disk.radial_segments=48;pedestal.mesh=disk;var mat=StandardMaterial3D.new();mat.albedo_color=Color("1b3e46");mat.roughness=.55;mat.metallic=.25;pedestal.material_override=mat;pedestal.position=preview.position-Vector3.UP*.07;add_child(pedestal)
 menu_camera=Camera3D.new();menu_camera.fov=39;menu_camera.position=preview.position+Vector3(2.7,1.4,3.2);add_child(menu_camera);menu_camera.look_at(preview.position+Vector3(0,.96,0));menu_camera.current=true
func set_look(index):
 prefs.data.look=clampi(index,0,5);prefs.save();var p=preview.position;preview.queue_free();preview=Citizen.new();add_child(preview);preview.position=p;preview.setup(int(prefs.data.look),quality)
 if not playing:player.set_look(int(prefs.data.look))
 if ui:ui.notify(["Raka","Kai","Atlas","Naya","Luna","Asha"][int(prefs.data.look)]+" · native rig selected")
func set_quality(value,save=true):
 prefs.data.quality=clampi(value,-1,2);quality=prefs.tier();quality_spec=Preferences.PRESETS[quality]
 if save:prefs.save()
 Engine.max_fps=int(quality_spec.fps);get_viewport().scaling_3d_scale=float(quality_spec.scale);get_viewport().mesh_lod_threshold=3.0 if quality==0 else 1.5
 if world:world.set_quality(quality)
 if ui and save:ui.notify(str(quality_spec.name)+" · tidak menjamin FPS semua perangkat")
func _populate():
 if not vehicles.is_empty():return
 var records=world.data.cars.duplicate();var spawn=Vector3(world.data.spawn.x/10.0,0,world.data.spawn.y/10.0)
 records.sort_custom(func(a,b):return Vector2(a.x/10.0-spawn.x,a.y/10.0-spawn.z).length_squared()<Vector2(b.x/10.0-spawn.x,b.y/10.0-spawn.z).length_squared())
 for r in records:
  var c=Car.new();add_child(c);c.configure(r,world.data.types,quality,audio_node);vehicles[int(r.id)]=c
 var count=int(quality_spec.people)
 for i in range(count):
  var point=_free_point(spawn+Vector3(5+(i%4)*2.8,0,-4-floori(i/4.0)*3.0))
  if point==null:continue
  var body=StaticBody3D.new();body.collision_layer=16;body.collision_mask=0;add_child(body);body.global_position=point
  var shape=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=.3;capsule.height=1.8;shape.shape=capsule;shape.position.y=.9;body.add_child(shape)
  var a=Citizen.new();body.add_child(a);a.setup(i%6,quality);a.rotation.y=.6+i*.8;body.set_meta("citizen",a);body.set_meta("body_shape",shape);npcs.append({"body":body,"avatar":a,"shape":shape,"down":false})
func start_game(use_online):
 if playing:return
 prefs.data.nickname=ui.name_input.text.strip_edges().left(16)
 if prefs.data.nickname=="":prefs.data.nickname="Warga"
 prefs.save();online=use_online;paused=false;playing=true;world.visible=true;world.environment.environment.background_mode=Environment.BG_SKY;world.environment.environment.fog_enabled=true;get_viewport().scaling_3d_scale=float(quality_spec.scale);preview.visible=false;pedestal.visible=false;player.visible=true
 _populate();player.enabled=true;player.online=online;player.global_position=Vector3(world.data.spawn.x/10.0,.05,world.data.spawn.y/10.0);player.facing=float(world.data.spawn.a);player.camera_yaw=player.facing;player.camera.current=true;menu_camera.current=false
 player.avatar.stop_ragdoll();player.avatar.visible=true;money=0;ui.show_game();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE if ui.touch.enabled else Input.MOUSE_MODE_CAPTURED
 for c in vehicles.values():c.networked=online;c.freeze=true;c.driver=0
 for n in npcs:n.body.visible=not online;n.shape.disabled=online
 audio_node.start_loop("ambient","wind",player.global_position,-32)
 if online:network.join();ui.notify("Online memakai server lama: physics kendaraan planar, voice native belum tersedia.",6)
 else:ui.notify("Latihan offline: kendaraan 3D dan ragdoll fisik aktif. K untuk uji jatuh.",5)
 job_point=Vector3(world.data.map.pois[0].x/10.0,0,world.data.map.pois[0].y/10.0)
func return_lobby():
 if player.driving:player.exit_vehicle(player.driving.nearest_door(player.global_position))
 playing=false;online=false;paused=false;network.leave();player.enabled=false;player.visible=false;world.visible=false;world.environment.environment.background_mode=Environment.BG_COLOR;world.environment.environment.fog_enabled=false;get_viewport().scaling_3d_scale=1.0;preview.visible=true;pedestal.visible=true;menu_camera.current=true;player.camera.current=false
 for c in vehicles.values():c.freeze=true
 for entry in active_ragdolls:
  if is_instance_valid(entry.avatar):entry.avatar.stop_ragdoll()
 active_ragdolls.clear();audio_node.stop_loop("player-engine");ui.touch.reset();ui.show_menu()
func toggle_pause():
 if not playing:return
 paused=not paused;ui.pause_panel.visible=paused;ui.gps_panel.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE if paused or ui.touch.enabled else Input.MOUSE_MODE_CAPTURED;ui.touch.reset()
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
 if event is InputEventMouseMotion and playing and not paused and Input.mouse_mode==Input.MOUSE_MODE_CAPTURED:player.orbit(event.relative)
 if event is InputEventMouseButton and playing and not paused:
  if event.button_index==MOUSE_BUTTON_LEFT and event.pressed and not ui.touch.enabled:
   if Input.mouse_mode!=Input.MOUSE_MODE_CAPTURED:Input.mouse_mode=Input.MOUSE_MODE_CAPTURED
  if event.button_index==MOUSE_BUTTON_WHEEL_UP and event.pressed:player.spring.spring_length=maxf(2,player.spring.spring_length-.25)
func _process(delta):
 if not playing:
  if preview:preview.rotation.y+=delta*.1
  return
 var typing=get_viewport().gui_get_focus_owner() is LineEdit
 var move=Vector2.ZERO
 if not paused and not typing:
  if ui.touch.enabled:move=ui.touch.axis;player.orbit(ui.touch.take_look())
  else:move=Vector2(float(Input.is_physical_key_pressed(KEY_D))-float(Input.is_physical_key_pressed(KEY_A)),float(Input.is_physical_key_pressed(KEY_S))-float(Input.is_physical_key_pressed(KEY_W))).limit_length(1)
 player.controls={"move":move,"sprint":(ui.touch.axis.length()>.86 if ui.touch.enabled else Input.is_physical_key_pressed(KEY_SHIFT)) and not paused,"jump":(ui.touch.held.brake if ui.touch.enabled else Input.is_physical_key_pressed(KEY_SPACE)) and not paused,"crouch":Input.is_physical_key_pressed(KEY_CTRL) and not ui.touch.enabled and not paused,"aim":(ui.touch.held.fire if ui.touch.enabled else Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) and not paused}
 player.enabled=not paused or online
 if player.driving:
  if not online:player.driving.set_drive(-move.y,move.x,player.controls.jump)
  audio_node.engine("player-engine",player.driving.global_position,player.driving.speed_mps,-move.y,true)
 else:audio_node.stop_loop("player-engine")
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
 if int(prefs.data.quality)<0 and adaptive_clock>5 and average_fps<24 and quality>0:
  adaptive_clock=0;quality-=1;quality_spec=Preferences.PRESETS[quality];world.set_quality(quality);get_viewport().scaling_3d_scale=float(quality_spec.scale);Engine.max_fps=int(quality_spec.fps);ui.notify("Grafis otomatis turun untuk menjaga respons.")
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
   var p=point+Vector3(cos(i*TAU/8)*radius,0,sin(i*TAU/8)*radius);p.y=.06
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
 for c in s.get("c",[]):
  var id=int(c.i)
  if not vehicles.has(id):
   var car=Car.new();add_child(car);car.configure({"id":id,"type":c.y2,"x":c.x,"y":c.y,"a":c.a},world.data.types,quality,audio_node);vehicles[id]=car
  vehicles[id].snapshot(c)
 var valid={}
 for p in s.get("p",[]):
  var id=int(p.i)
  if id==network.my_id:
   money=int(p.get("$",0));player.authoritative(p);var v=int(p.get("v",0))
   if v!=0 and vehicles.has(v) and player.driving!=vehicles[v]:player.enter_vehicle(vehicles[v])
   elif v==0 and player.driving:player.exit_vehicle(Vector3(float(p.x)/10,.05,float(p.y)/10))
   continue
  valid[id]=true
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
 start_game(false)
 for i in range(20):await get_tree().physics_frame
 _check(player.avatar.skeleton.get_bone_count()==65,"native skeleton")
 _check(vehicles.size()>0,"native vehicle resources")
 player.controls.move=Vector2(0,-1)
 var before=player.global_position
 for i in range(60):await get_tree().physics_frame
 # The full renderer/controller test can also be run on an exported EXE, without WebView/browser.
 _check(player.global_position.is_finite(),"controller finite")
 player.knockdown(Vector3(2,1,0))
 for i in range(180):await get_tree().physics_frame
 _check(player.avatar.physical.size()>=11,"physical bone bodies")
 _check(player.global_position.is_finite(),"ragdoll recovery finite")
 print("NATIVE_APP_SMOKE_PASS" if native_failures==0 else "NATIVE_APP_SMOKE_FAIL", " checks=",native_checks," renderer=",DisplayServer.get_name());get_tree().quit(0 if native_failures==0 else 1)
func _online_test():
 start_game(true)
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
