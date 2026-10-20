extends Node3D
# Avatar — Ultimate Modular Men/Women (CC0 Quaternius) with baked outfits per look.
const ClothSpring=preload("res://scripts/cloth_spring.gd")
const LOOKS={
 0:{"file":"men-Casual_Hoodie","label":"Hoodie Street"},
 1:{"file":"men-Casual_2","label":"Kasual"},
 2:{"file":"men-Suit","label":"Setelan"},
 3:{"file":"women-Casual","label":"Kasual Wanita"},
 4:{"file":"women-Punk","label":"Punk"},
 5:{"file":"women-Formal","label":"Formal"}}
const CLIP_MAP={
 "Idle":"Idle","Walk":"Walk","Jog_Fwd":"Run","Sprint":"Run","Crouch_Fwd":"Walk","Crouch_Idle":"Idle_Neutral",
 "Driving":"Idle","Sitting_Idle":"Idle_Neutral","Jump":"Roll","Jump_Land":"Idle","Jump_Start":"Roll",
 "Pistol_Idle":"Idle_Gun","Pistol_Aim_Neutral":"Idle_Gun_Pointing","Pistol_Shoot":"Gun_Shoot",
 "Pistol_Reload":"Interact","Dance":"Wave","Death":"Death","Hit_Chest":"HitRecieve","Hit_Head":"HitRecieve_2",
 "Interact":"Interact"}
const LOOP_CLIPS=["Idle","Walk","Run","Run_Back","Run_Left","Run_Right","Idle_Gun","Idle_Gun_Pointing","Idle_Neutral","Idle_Sword"]
var model:Node3D
var skeleton:Skeleton3D
var animator:AnimationPlayer
var simulator:PhysicalBoneSimulator3D
var physical=[]
var rest_positions=[]
var rest_rotations=[]
var ragdoll=false
var current=""
var look=0
var lod_bias=1.0
var bone_count=15
var seen_meshes=[]
var weapon:Node3D
var muzzle:Marker3D
var attack_time=0.0
var ragdoll_prepared=false
var motion_speed=0.0
var motion_time=0.0
var was_airborne=false
var land_time=0.0
var angular_lag=0.0
var prev_yaw=0.0
var springs=[]
func _init():
 pass
func setup(preset=0,quality=1):
 look=clampi(preset,0,5);lod_bias=[.5,1.0,1.4][quality];bone_count=11 if quality==0 else 15
 if model and is_instance_valid(model):model.queue_free();model=null
 var path="res://assets/people/umm/%s.glb"%LOOKS[look]["file"]
 var packed=load(path)
 model=packed.instantiate();add_child(model)
 skeleton=_find(model,"Skeleton3D")
 animator=_find(model,"AnimationPlayer")
 if animator:
  for clip in animator.get_animation_list():
   if str(clip) in LOOP_CLIPS:animator.get_animation(clip).loop_mode=Animation.LOOP_LINEAR
 assert(skeleton!=null,"Native asset must contain a real Skeleton3D")
 for i in range(skeleton.get_bone_count()):rest_positions.append(skeleton.get_bone_pose_position(i));rest_rotations.append(skeleton.get_bone_pose_rotation(i))
 for node in _all(model):
  if node is MeshInstance3D:
   node.lod_bias=lod_bias;node.extra_cull_margin=.8;seen_meshes.append(node)
   for s in range(node.mesh.get_surface_count()):
    var mat=node.get_surface_override_material(s)
    if mat==null:mat=node.mesh.surface_get_material(s)
    if mat==null:continue
    var mn=str(mat.resource_name)
    if "Skin" in mn:
     var sm=mat.duplicate();sm.roughness=.56;sm.metallic=0.0;node.set_surface_override_material(s,sm)
    elif "Eye" in mn:
     var em=mat.duplicate();em.roughness=.28;node.set_surface_override_material(s,em)
    elif "Hair" in mn:
     var hm=mat.duplicate();hm.roughness=.72;node.set_surface_override_material(s,hm)
 _add_weapon()
 current="";play_motion("Idle_Loop")
 if animator:animator.seek(0,true)
func _find(root,kind):
 if root.is_class(kind):return root
 for child in root.get_children():
  var found=_find(child,kind)
  if found:return found
 return null
func _all(root):
 var out=[root]
 for child in root.get_children():out.append_array(_all(child))
 return out
func set_active(value):
 process_mode=Node.PROCESS_MODE_INHERIT if value else Node.PROCESS_MODE_DISABLED
 if animator:animator.active=value
func _add_weapon():
 if animator==null:return
 animator.play("Idle_Gun_Pointing");animator.seek(.1,true);skeleton.force_update_all_bone_transforms()
 var id=skeleton.find_bone("Wrist.R")
 if id<0:return
 var pose=skeleton.get_bone_global_pose(id)
 var attach=BoneAttachment3D.new();attach.bone_name="Wrist.R";skeleton.add_child(attach)
 weapon=Node3D.new();attach.add_child(weapon)
 weapon.transform=pose.affine_inverse()*Transform3D(Basis.IDENTITY,pose.origin+Vector3(0,.02,.07))
 var material=StandardMaterial3D.new();material.albedo_color=Color("303943");material.metallic=.75;material.roughness=.35
 for spec in [[Vector3(.035,.035,.19),Vector3(0,.01,.055)],[Vector3(.031,.085,.048),Vector3(0,-.04,-.005)]]:
  var mesh=MeshInstance3D.new();var box=BoxMesh.new();box.size=spec[0];mesh.mesh=box;mesh.position=spec[1];mesh.material_override=material;weapon.add_child(mesh)
 muzzle=Marker3D.new();muzzle.position=Vector3(0,.012,.16);weapon.add_child(muzzle);weapon.visible=false
func fire_animation():
 attack_time=.25;current="";play_motion("Pistol_Shoot",1.15)
 if weapon:weapon.visible=true
func _process(delta):
 attack_time=maxf(0,attack_time-delta)
 motion_time+=delta
 if ragdoll:
  if weapon:weapon.visible=false
  return
 var yaw_now=global_rotation.y
 var yaw_delta=wrapf(yaw_now-prev_yaw,-PI,PI)
 prev_yaw=yaw_now
 angular_lag=lerpf(angular_lag,clampf(-yaw_delta/maxf(delta,0.0001)*.05,-.16,.16),1-exp(-delta*7.0))
 if model:
  var run=clampf(motion_speed/6.2,0.0,1.0)
  var lean=run*-.062-(.012 if not was_airborne and motion_speed<.4 else 0.0)
  var sway=sin(motion_time*(2.2+motion_speed*.35))*clampf(motion_speed*.012,0.0,.042)
  var bob=sin(motion_time*(3.1+motion_speed*.55))*clampf(motion_speed*.013,0.0,.034)
  var breath=sin(motion_time*1.35)*.006*(1.0-run)
  land_time=maxf(0.0,land_time-delta)
  var land_dip=-(land_time*land_time)*.55
  model.rotation.x=lerpf(model.rotation.x,lean,1-exp(-delta*6.0))
  var drive_bank=0.0
  model.rotation.z=lerpf(model.rotation.z,sway+drive_bank,1-exp(-delta*5.0))
  model.rotation.y=lerpf(model.rotation.y,clampf(angular_lag,-.16,.16),1-exp(-delta*4.2))
  model.position.y=lerpf(model.position.y,bob+breath+land_dip,1-exp(-delta*6.5))
  var vel_world=-global_transform.basis.z*motion_speed
  var yaw_push=clampf(angular_lag*2.2,-3.0,3.0)
  for spring in springs:
   if is_instance_valid(spring):spring.push(vel_world,yaw_push,global_transform.basis)
func _make_ragdoll():
 if ragdoll_prepared:return
 ragdoll_prepared=true
 simulator=PhysicalBoneSimulator3D.new();skeleton.add_child(simulator)
 var specs=[ ["Hips",.12,.20,8.0],["Chest",.13,.26,10.0],["Head",.105,.22,4.0],
  ["UpperArm.L",.055,.25,1.8],["LowerArm.L",.045,.24,1.2],["UpperArm.R",.055,.25,1.8],["LowerArm.R",.045,.24,1.2],
  ["UpperLeg.L",.075,.42,4.5],["LowerLeg.L",.055,.44,2.6],["UpperLeg.R",.075,.42,4.5],["LowerLeg.R",.055,.44,2.6] ]
 if bone_count>11:specs.append_array([["Wrist.L",.04,.12,.5],["Wrist.R",.04,.12,.5],["Foot.L",.06,.16,.9],["Foot.R",.06,.16,.9]])
 for spec in specs:
  var id=skeleton.find_bone(spec[0]);if id<0:continue
  var b=PhysicalBone3D.new();b.name="Physical_"+spec[0];simulator.add_child(b);b.set("bone_name",spec[0]);b.mass=spec[3];b.friction=.7;b.bounce=.05;b.collision_layer=0;b.collision_mask=0
  var offset=Transform3D.IDENTITY;offset.origin=Vector3(0,spec[2]*.45,0);b.body_offset=offset
  var joint=Transform3D.IDENTITY;joint.origin=-offset.origin;b.joint_offset=joint
  var hinge="LowerArm" in spec[0] or "LowerLeg" in spec[0]
  b.joint_type=PhysicalBone3D.JOINT_TYPE_HINGE if hinge else PhysicalBone3D.JOINT_TYPE_CONE
  if hinge:
   b.set("joint_constraints/angular_limit_enabled",true);b.set("joint_constraints/angular_limit_lower",-.08);b.set("joint_constraints/angular_limit_upper",2.65)
  else:
   b.set("joint_constraints/swing_span",.8);b.set("joint_constraints/twist_span",.55)
  var collision=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=spec[1];capsule.height=maxf(spec[2],spec[1]*2);collision.shape=capsule;b.add_child(collision);physical.append(b)
 simulator.physical_bones_stop_simulation()
func _clip_name(clip):
 var base=str(clip).trim_suffix("_Loop")
 if CLIP_MAP.has(base):return CLIP_MAP[base]
 return base
func play_motion(clip,speed=1.0):
 if ragdoll or animator==null:return
 var want=_clip_name(clip)
 if not animator.has_animation(want):
  for candidate in animator.get_animation_list():
   if str(candidate).ends_with(want):want=str(candidate);break
 if animator.has_animation(want):
  animator.speed_scale=lerpf(animator.speed_scale,speed,0.22)
  if current!=want:animator.play(want,.28);current=want
func locomotion(speed,sprinting,airborne=false,crouched=false,seated=false,aim=false):
 if ragdoll:return
 if airborne:was_airborne=true
 elif was_airborne:was_airborne=false;land_time=.26
 motion_speed=speed
 if weapon:weapon.visible=(aim or attack_time>0) and not seated
 var clip="Idle_Loop"
 if seated:clip="Sitting_Idle_Loop"
 elif airborne:clip="Jump_Loop"
 elif land_time>.12:clip="Jump_Land"
 elif attack_time>0:clip="Pistol_Shoot"
 elif aim:clip="Pistol_Aim_Neutral"
 elif crouched:clip="Crouch_Fwd_Loop" if speed>.2 else "Crouch_Idle_Loop"
 elif sprinting and speed>3.8:clip="Sprint_Loop"
 elif speed>1.8:clip="Jog_Fwd_Loop"
 elif speed>.15:clip="Walk_Loop"
 play_motion(clip,clampf(speed/3.15,.86,1.22) if clip in ["Jog_Fwd_Loop","Walk_Loop","Sprint_Loop"] else 1.0)
func emote():
 if ragdoll:return
 current="";play_motion("Dance_Loop")
func hit_reaction():
 if ragdoll:return
 attack_time=.2;current="";play_motion("Hit_Chest")
func start_ragdoll(impulse=Vector3.ZERO):
 if ragdoll:return
 if not ragdoll_prepared:_make_ragdoll()
 ragdoll=true
 if animator:animator.stop(true)
 simulator.physical_bones_start_simulation()
 for b in physical:b.collision_layer=8;b.collision_mask=1|2;b.linear_velocity=impulse.limit_length(8);b.angular_velocity=Vector3(.3,.15,.4)
func stop_ragdoll():
 if not ragdoll:return
 simulator.physical_bones_stop_simulation();ragdoll=false
 for b in physical:b.collision_layer=0;b.collision_mask=0
 for i in range(skeleton.get_bone_count()):skeleton.set_bone_pose_position(i,rest_positions[i]);skeleton.set_bone_pose_rotation(i,rest_rotations[i])
 current="";play_motion("Idle_Loop")
func body_position():
 if ragdoll and physical.size()>0:return physical[0].global_position
 return global_position+Vector3.UP
func set_ghost(value):
 visible=not value
