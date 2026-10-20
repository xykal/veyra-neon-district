extends Node3D

const MODEL_PATHS=["res://assets/people/citizen_male.glb","res://assets/people/citizen_female.glb"]
const COATS=[Color("3d4a2e"),Color("ddd6c5"),Color("252c37"),Color("625985"),Color("a84c49"),Color("8c674c")]
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
var wear_nodes=[]
func _init():
 pass
func setup(preset=0,quality=1):
 look=clampi(preset,0,5);lod_bias=[.5,1.0,1.4][quality];bone_count=11 if quality==0 else 15
 model=load(MODEL_PATHS[1 if look>=3 else 0]).instantiate();add_child(model)
 skeleton=_find(model,"Skeleton3D")
 animator=_find(model,"AnimationPlayer")
 if animator:
  for clip in animator.get_animation_list():
   if str(clip) in ["Idle","Walk","Jog_Fwd","Sprint","Crouch_Idle","Crouch_Fwd","Driving","Sitting_Idle","Pistol_Idle","Dance","Jump"]:animator.get_animation(clip).loop_mode=Animation.LOOP_LINEAR
 assert(skeleton!=null,"Native asset must contain a real Skeleton3D")
 for i in range(skeleton.get_bone_count()):rest_positions.append(skeleton.get_bone_pose_position(i));rest_rotations.append(skeleton.get_bone_pose_rotation(i))
 for node in _all(model):
  if node is MeshInstance3D:
   node.lod_bias=lod_bias;node.extra_cull_margin=.8;seen_meshes.append(node)
   if str(node.name).begins_with("Eyebrows"):
    var brow=StandardMaterial3D.new();brow.albedo_color=Color("30231d");brow.roughness=.95;node.material_override=brow
   var short_top="TopShort" in node.name;var long_top="TopLong" in node.name;var short_pants="PantsShort" in node.name;var long_pants="PantsLong" in node.name
   node.visible=not (short_top or long_top or short_pants or long_pants)
   if short_top:node.visible=look==1 or look==4
   if long_top:node.visible=look!=1 and look!=4
   if short_pants:node.visible=look==4
   if long_pants:node.visible=look!=4
   if "Boots" in node.name:
    var bm=StandardMaterial3D.new();bm.albedo_color=Color("241b13");bm.roughness=.62
    node.material_override=bm
   if "HoodShell" in node.name or "TailShell" in node.name:
    node.visible=false
   if short_top or long_top or short_pants or long_pants:
    var m=_fabric_mat(COATS[look] if short_top or long_top else Color("14171c"),"fabric" if short_top or long_top else "denim",.86)
    m.grow=true;m.grow_amount=.010 if short_top or long_top else .008;node.material_override=m
 var shapes=[Vector3.ONE,Vector3.ONE*1.02,Vector3.ONE*1.05,Vector3.ONE,Vector3.ONE*.97,Vector3.ONE*1.03]
 model.scale=shapes[look]
 _add_hair()
 _add_weapon()
 _add_streetwear()
 if skeleton.find_bone("cloth_hood_a")>=0:
  var sh=ClothSpring.new();add_child(sh);sh.bind_bones(skeleton,"cloth_hood_a","cloth_hood_b",0.5);springs.append(sh)
  var st=ClothSpring.new();add_child(st);st.bind_bones(skeleton,"cloth_tail_a","cloth_tail_b",0.42);springs.append(st)
 current="";play_motion("Idle_Loop")
 if animator:animator.seek(0,true)
const ClothSpring=preload("res://scripts/cloth_spring.gd")
var springs=[]
func _fabric_mat(color,tex_dir,rough=.85):
 var m=StandardMaterial3D.new();m.albedo_color=color;m.roughness=rough
 var alb=load("res://assets/textures/"+tex_dir+"/albedo.jpg")
 if alb:
  m.albedo_texture=alb;m.uv1_triplanar=true;m.uv1_scale=Vector3(6.5,6.5,6.5)
  var nrm=load("res://assets/textures/"+tex_dir+"/normal.jpg")
  if nrm:m.normal_enabled=true;m.normal_texture=nrm;m.normal_scale=.28
 return m
func _swing(attachment,piece,swing,tilt_amt,bob):
 var spring=ClothSpring.new();attachment.add_child(spring)
 if piece.get_parent():piece.get_parent().remove_child(piece)
 spring.add_child(piece)
 spring.configure(swing,tilt_amt,bob);springs.append(spring);return spring
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
func _add_hair():
 var attachment=BoneAttachment3D.new();attachment.bone_name="Head";skeleton.add_child(attachment)
 var names=["parted","buzz","buzz","long","buns","parted"]
 var hair=load("res://assets/people/hair_"+names[look]+".glb").instantiate();attachment.add_child(hair)
 _swing(attachment,hair,.05,.42,.010)
 for node in _all(hair):
  if node is MeshInstance3D:
   for surface in range(node.mesh.get_surface_count()):
    var source=node.mesh.surface_get_material(surface);var m=source.duplicate() if source else StandardMaterial3D.new();m.albedo_color=Color("30231d") if look!=5 else Color("714c2e");m.roughness=.85;node.set_surface_override_material(surface,m)
func _add_streetwear() -> void:
    """Hair only — clothing is the skinned outfit now."""
    pass

func _add_weapon():
 if animator==null:return
 animator.play("Pistol_Aim_Neutral");animator.seek(.1,true);skeleton.force_update_all_bone_transforms()
 var id=skeleton.find_bone("hand_r")
 if id<0:return
 var pose=skeleton.get_bone_global_pose(id)
 var attach=BoneAttachment3D.new();attach.bone_name="hand_r";skeleton.add_child(attach)
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
 # Turn-rate lag: body leans into direction changes like GTA-era locomotion.
 var yaw_now=global_rotation.y
 var yaw_delta=wrapf(yaw_now-prev_yaw,-PI,PI)
 prev_yaw=yaw_now
 angular_lag=lerpf(angular_lag,clampf(-yaw_delta/maxf(delta,0.0001)*.05,-.16,.16),1-exp(-delta*7.0))
 # Additive idle/locomotion layer: forward lean, side sway, breathing, turn & landing.
 if model:
  var run=clampf(motion_speed/6.2,0.0,1.0)
  var lean=run*-.062-(.012 if not was_airborne and motion_speed<.4 else 0.0)
  var sway=sin(motion_time*(2.2+motion_speed*.35))*clampf(motion_speed*.012,0.0,.042)
  var bob=sin(motion_time*(3.1+motion_speed*.55))*clampf(motion_speed*.013,0.0,.034)
  var breath=sin(motion_time*1.35)*.006*(1.0-run)
  land_time=maxf(0.0,land_time-delta)
  var land_dip=-(land_time*land_time)*.55
  model.rotation.x=lerpf(model.rotation.x,lean,1-exp(-delta*6.0))
  var drive_bank=clampf(angular_lag*1.15,-.13,.13) if current in ["Driving","Sitting_Idle"] else 0.0
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
 var specs=[ ["pelvis",.12,.20,8.0],["spine_03",.13,.26,10.0],["Head",.105,.22,4.0], ["upperarm_l",.055,.25,1.8],["lowerarm_l",.045,.24,1.2],["upperarm_r",.055,.25,1.8],["lowerarm_r",.045,.24,1.2], ["thigh_l",.075,.42,4.5],["calf_l",.055,.44,2.6],["thigh_r",.075,.42,4.5],["calf_r",.055,.44,2.6] ]
 if bone_count>11:specs.append_array([["hand_l",.04,.12,.5],["hand_r",.04,.12,.5],["foot_l",.06,.16,.9],["foot_r",.06,.16,.9]])
 for spec in specs:
  var id=skeleton.find_bone(spec[0]);if id<0:continue
  var b=PhysicalBone3D.new();b.name="Physical_"+spec[0];simulator.add_child(b);b.set("bone_name",spec[0]);b.mass=spec[3];b.friction=.7;b.bounce=.05;b.collision_layer=0;b.collision_mask=0
  var offset=Transform3D.IDENTITY;offset.origin=Vector3(0,spec[2]*.45,0);b.body_offset=offset
  var joint=Transform3D.IDENTITY;joint.origin=-offset.origin;b.joint_offset=joint
  var hinge="lowerarm" in spec[0] or "calf" in spec[0]
  b.joint_type=PhysicalBone3D.JOINT_TYPE_HINGE if hinge else PhysicalBone3D.JOINT_TYPE_CONE
  if hinge:
   b.set("joint_constraints/angular_limit_enabled",true);b.set("joint_constraints/angular_limit_lower",-.08);b.set("joint_constraints/angular_limit_upper",2.65)
  else:
   b.set("joint_constraints/swing_span",.8);b.set("joint_constraints/twist_span",.55)
  var collision=CollisionShape3D.new();var capsule=CapsuleShape3D.new();capsule.radius=spec[1];capsule.height=maxf(spec[2],spec[1]*2);collision.shape=capsule;b.add_child(collision);physical.append(b)
 simulator.physical_bones_stop_simulation()
func play_motion(clip,speed=1.0):
 clip=str(clip).trim_suffix("_Loop")
 if ragdoll or animator==null:return
 if not animator.has_animation(clip):
  for candidate in animator.get_animation_list():
   if str(candidate).ends_with(clip):clip=candidate;break
 if animator.has_animation(clip):
  animator.speed_scale=lerpf(animator.speed_scale,speed,0.22)
  if current!=clip:animator.play(clip,.28);current=clip
func locomotion(speed,sprinting,airborne=false,crouched=false,seated=false,aim=false):
 if ragdoll:return
 if airborne:was_airborne=true
 elif was_airborne:was_airborne=false;land_time=.26
 motion_speed=speed
 if weapon:weapon.visible=(aim or attack_time>0) and not seated
 var clip="Idle_Loop"
 if seated:clip="Driving_Loop"
 elif airborne:clip="Jump_Loop"
 elif land_time>.12 and animator and animator.has_animation("Jump_Land"):clip="Jump_Land"
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
 if skeleton.find_bone("cloth_hood_a")>=0:
  var sh=ClothSpring.new();add_child(sh);sh.bind_bones(skeleton,"cloth_hood_a","cloth_hood_b",0.5);springs.append(sh)
  var st=ClothSpring.new();add_child(st);st.bind_bones(skeleton,"cloth_tail_a","cloth_tail_b",0.42);springs.append(st)
 current="";play_motion("Idle_Loop")
func body_position():
 if ragdoll and physical.size()>0:return physical[0].global_position
 return global_position+Vector3.UP
func set_ghost(value):
 visible=not value
