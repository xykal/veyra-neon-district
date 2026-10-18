extends CharacterBody3D

const Avatar=preload("res://scripts/avatar.gd")
var avatar
var collision:CollisionShape3D
var camera:Camera3D
var pivot:Node3D
var spring:SpringArm3D
var controls={"move":Vector2.ZERO,"sprint":false,"jump":false,"crouch":false,"aim":false}
var camera_yaw=0.0
var camera_pitch=.15
var facing=0.0
var stamina=1.0
var driving=null
var enabled=false
var online=false
var audio_node=null
var step_distance=0.0
var jump_latch=false
var ragdoll_timer=0.0
var external_dead=false
var correction=Vector2.ZERO
var quality=0
var health=100.0
var last_look_time=-10000
func setup(look=0,tier=0,audio=null):
 quality=tier;audio_node=audio;collision_layer=4;collision_mask=1|2|16
 collision=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=.42;capsule.height=1.8;collision.shape=capsule;collision.position.y=.9;add_child(collision)
 floor_snap_length=.3;safe_margin=.015
 avatar=Avatar.new();add_child(avatar);avatar.setup(look,tier)
 pivot=Node3D.new();pivot.position.y=1.2;add_child(pivot);spring=SpringArm3D.new();spring.spring_length=4.1;spring.margin=.14;var sphere=SphereShape3D.new();sphere.radius=.14;spring.shape=sphere;spring.collision_mask=1|2|16;spring.add_excluded_object(get_rid());pivot.add_child(spring)
 camera=Camera3D.new();camera.fov=62;camera.near=.16;camera.far=105;spring.add_child(camera)
func reset_session():
 if driving:exit_vehicle(driving.nearest_door(global_position))
 avatar.stop_ragdoll();avatar.set_active(true);avatar.visible=true;avatar.position=Vector3.ZERO
 external_dead=false;ragdoll_timer=0;velocity=Vector3.ZERO;health=100;stamina=1;jump_latch=false
 collision.disabled=false;collision_layer=4;collision_mask=1|2|16
 pivot.position=Vector3(0,1.2,0);avatar.rotation=Vector3(0,PI/2-facing,0)
func set_look(look):
 avatar.queue_free();avatar=Avatar.new();add_child(avatar);avatar.setup(look,quality)
func orbit(delta):
 if delta.length_squared()>.01:last_look_time=Time.get_ticks_msec()
 camera_yaw+=delta.x*.0038;camera_pitch=clampf(camera_pitch+delta.y*.0028,-.1,.8)
func _physics_process(delta):
 if not enabled:return
 var previous=global_position
 if driving:
  global_position=driving.global_position;velocity=Vector3.ZERO
  var front=driving.global_basis.x;facing=atan2(front.z,front.x)
  if Time.get_ticks_msec()-last_look_time>1200:camera_yaw=lerp_angle(camera_yaw,facing,1-exp(-delta*2.8))
  var seat=driving.to_global(Vector3(driving.length_m*.08,.03,-driving.width_m*.19));avatar.global_position=seat;avatar.global_basis=driving.global_basis*Basis(Vector3.UP,PI/2);avatar.locomotion(0,false,false,false,true)
  pivot.position=Vector3(0,minf(2.2,driving.height_m*.65+.3),0);spring.spring_length=7.2+minf(1.7,absf(driving.speed_mps)*.04)
 elif avatar.ragdoll:
  pivot.global_position=avatar.body_position()+Vector3.UP*.4;spring.spring_length=4.6
  ragdoll_timer-=delta
  if ragdoll_timer<=0 and not external_dead:recover()
 else:
  avatar.position=Vector3.ZERO;pivot.position=Vector3(0,1.2,0);spring.spring_length=3.4 if controls.aim else 4.1
  var axis:Vector2=controls.move;var forward=Vector3(cos(camera_yaw),0,sin(camera_yaw));var right=Vector3(-sin(camera_yaw),0,cos(camera_yaw));var direction=(forward*-axis.y+right*axis.x).limit_length(1)
  var sprinting=controls.sprint and stamina>.08 and not controls.crouch and not controls.aim
  var speed=6.2 if sprinting else (1.4 if controls.crouch else 3.0)
  if sprinting and axis.length()>.5:stamina=maxf(0,stamina-delta*.19)
  else:stamina=minf(1,stamina+delta*.13)
  var acceleration=1-exp(-delta*(13 if direction.length()>.01 else 21));velocity.x=lerpf(velocity.x,direction.x*speed,acceleration);velocity.z=lerpf(velocity.z,direction.z*speed,acceleration)
  if not is_on_floor():velocity.y-=9.81*delta
  elif controls.jump and not jump_latch and not online:velocity.y=4.4;floor_snap_length=0
  else:floor_snap_length=.3;velocity.y=-.1
  jump_latch=controls.jump
  move_and_slide()
  # A shallow step-up keeps kerbs from becoming invisible waist-high walls.
  if is_on_wall() and is_on_floor() and direction.length()>.2:
   var test=global_transform;test.origin.y+=.18
   if not test_move(test,direction*.15):global_position.y+=.18
  var moving=Vector2(velocity.x,velocity.z).length()
  if moving>.1:facing=lerp_angle(facing,atan2(velocity.z,velocity.x),1-exp(-delta*11))
  if controls.aim:facing=camera_yaw
  avatar.rotation.y=PI/2-facing;avatar.locomotion(moving,sprinting,not is_on_floor(),controls.crouch,false,controls.aim)
  step_distance+=Vector2(global_position.x-previous.x,global_position.z-previous.z).length()
  if is_on_floor() and moving>.6 and step_distance>(1.55 if sprinting else 1.05):
   step_distance=0
   if audio_node:audio_node.play_at("step_"+str(randi()%4),global_position,-9,randf_range(.92,1.08))
 pivot.rotation=Vector3(-camera_pitch,-camera_yaw-PI/2,0)
 if camera.current and avatar and not avatar.ragdoll and driving==null:avatar.visible=spring.get_hit_length()>.65
func enter_vehicle(car):
 driving=car;collision.disabled=true;car.add_collision_exception_with(self);add_collision_exception_with(car);car.driver=1;car.freeze=online
 spring.add_excluded_object(car.get_rid());velocity=Vector3.ZERO
func exit_vehicle(point):
 if driving:
  spring.remove_excluded_object(driving.get_rid());driving.driver=0;driving.remove_collision_exception_with(self);remove_collision_exception_with(driving)
 driving=null;global_position=point;avatar.position=Vector3.ZERO;avatar.visible=true;collision.set_deferred("disabled",false);velocity=Vector3.ZERO
func knockdown(impulse=Vector3.ZERO,seconds=2.7):
 if driving:return
 ragdoll_timer=seconds;collision.set_deferred("disabled",true);avatar.start_ragdoll(impulse)
func recover():
 var point=avatar.body_position();avatar.stop_ragdoll();global_position=Vector3(point.x,maxf(.05,point.y),point.z);avatar.position=Vector3.ZERO;avatar.rotation.y=PI/2-facing;collision.set_deferred("disabled",false);velocity=Vector3.ZERO
func authoritative(p):
 var server=Vector3(float(p.x)/10,global_position.y,float(p.y)/10);var error=Vector2(server.x-global_position.x,server.z-global_position.z)
 if error.length()>3:global_position=server
 else:global_position.x+=error.x*.35;global_position.z+=error.y*.35
 health=float(p.h)
 if int(p.d)==1:
  if not avatar.ragdoll:external_dead=true;knockdown(Vector3(float(p.get("vx",0))/10,0,float(p.get("vy",0))/10))
 else:
  external_dead=false
  if avatar.ragdoll:avatar.stop_ragdoll();global_position=server;avatar.position=Vector3.ZERO;collision.set_deferred("disabled",false);velocity=Vector3.ZERO
func input_packet():
 var axis:Vector2=controls.move
 if driving:return {"throttle":-axis.y,"steer":axis.x,"handbrake":controls.jump}
 var f=Vector3(cos(camera_yaw),0,sin(camera_yaw));var r=Vector3(-sin(camera_yaw),0,cos(camera_yaw));var d=f*-axis.y+r*axis.x
 if controls.crouch:d*=1.4/3.0
 return {"mx":d.x,"my":d.z,"sprint":controls.sprint and not controls.crouch and not controls.aim and stamina>.08,"aim":controls.aim,"aimAngle":camera_yaw}
