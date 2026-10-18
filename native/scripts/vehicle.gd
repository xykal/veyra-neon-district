extends RigidBody3D
# Four ray-suspension contacts, tyre forces, real 6-DOF body contacts; offline native simulation.
# Online snapshots remain authoritative through the existing planar server adapter.
var vehicle_id=0
var kind="sedan"
var definition={}
var length_m=4.6
var width_m=2.4
var height_m=1.7
var driver=0
var ai=false
var networked=false
var hp=100.0
var throttle=0.0
var steer=0.0
var braking=false
var steering=0.0
var speed_mps=0.0
var last_speed=0.0
var wheel_contacts=0
var ray_points=[]
var visual:Node3D
var wheel_nodes=[]
var wheel_spin=0.0
var audio_node=null
var ai_target=Vector3.ZERO
var headlamp_nodes=[]
var headlamps_on=false
var impact_cooldown=0.0
var net_seen=false
var net_target=Vector3.ZERO
var net_yaw=0.0
const FILES={"sedan":"sedan","sport":"sport","truck":"pickup","police":"police","taxi":"taxi","van":"van","bus":"bus","ambulance":"ambulance","firetruck":"firetruck","garbage":"garbage-truck","delivery":"delivery","suv":"suv","luxury":"suv-luxury","supercar":"race","kart":"kart-ooli","shovel":"tractor-shovel","tractor":"tractor"}
const ROTATED=["taxi","ambulance","firetruck","garbage","delivery","suv","luxury","supercar","kart","shovel"]
func configure(record,types,tier=0,audio=null):
 vehicle_id=int(record.id);kind=str(record.type);definition=types.get(kind,types.sedan);length_m=float(definition.len)/10.0;width_m=float(definition.wid)/10.0
 mass=float(definition.mass)*1300;center_of_mass_mode=RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM;center_of_mass=Vector3(0,.45,0);linear_damp=.035;angular_damp=.5;collision_layer=2;collision_mask=1|2|4|8
 freeze_mode=RigidBody3D.FREEZE_MODE_STATIC;freeze=true;contact_monitor=true;max_contacts_reported=4;continuous_cd=true;body_entered.connect(_impact)
 var mat=PhysicsMaterial.new();mat.friction=.55;mat.bounce=.05;physics_material_override=mat
 _load_model(tier)
 var box=CollisionShape3D.new();var shape=BoxShape3D.new();shape.size=Vector3(length_m,maxf(.45,height_m-.42),width_m);box.shape=shape;box.position.y=.42+shape.size.y/2;add_child(box)
 ray_points=[Vector3(length_m*.32,.9,width_m*.42),Vector3(length_m*.32,.9,-width_m*.42),Vector3(-length_m*.32,.9,width_m*.42),Vector3(-length_m*.32,.9,-width_m*.42)]
 audio_node=audio
 global_position=Vector3(float(record.x)/10,.03,float(record.y)/10);rotation.y=-float(record.a)
func _load_model(tier):
 visual=Node3D.new();add_child(visual)
 var file=FILES.get(kind,"sedan");var model=load("res://assets/cars/"+file+".glb").instantiate();visual.add_child(model)
 if kind in ROTATED:model.rotation.y=PI/2
 model.force_update_transform()
 var box=_bounds(model);var size=box.size;model.position-=Vector3(box.position.x+size.x/2,box.position.y,box.position.z+size.z/2)
 visual.scale=Vector3(length_m/maxf(.01,size.x),length_m/maxf(.01,size.x),width_m/maxf(.01,size.z));height_m=size.y*visual.scale.y
 for node in _nodes(model):
  if node is MeshInstance3D:
   node.visibility_range_end=[80.0,130.0,200.0][tier];node.lod_bias=[.6,1.0,1.3][tier]
   if "wheel" in str(node.name).to_lower():wheel_nodes.append({"node":node,"rest":node.quaternion,"front":"front" in str(node.name),"spin":0.0})
func _nodes(root):
 var out=[root]
 for c in root.get_children():out.append_array(_nodes(c))
 return out
func _bounds(root):
 var result=AABB();var first=true
 for n in _nodes(root):
  if n is MeshInstance3D:
   var relative=root.get_parent().global_transform.affine_inverse()*n.global_transform;var b=relative*n.get_aabb()
   if first:result=b;first=false
   else:result=result.merge(b)
 return result
func set_drive(gas,turn,handbrake):
 throttle=clampf(gas,-1,1);steer=clampf(turn,-1,1);braking=handbrake
func _physics_process(delta):
 impact_cooldown=maxf(0,impact_cooldown-delta)
 if networked:
  global_position=global_position.lerp(net_target,1-exp(-delta*16));rotation.y=lerp_angle(rotation.y,net_yaw,1-exp(-delta*16));_animate_wheels(delta);return
 if freeze:
  _animate_wheels(delta);return
 if ai and driver==0:_autopilot()
 var forward=global_basis.x.normalized();speed_mps=linear_velocity.dot(forward);last_speed=linear_velocity.length();steering=lerpf(steering,steer,1-exp(-delta*7));wheel_contacts=0
 var state=get_world_3d().direct_space_state
 for i in range(4):
  var local=ray_points[i];var from=to_global(local);var to=from-global_basis.y*1.25
  var query=PhysicsRayQueryParameters3D.create(from,to,1|2);query.exclude=[get_rid()];var hit=state.intersect_ray(query)
  if hit.is_empty():continue
  var normal:Vector3=hit.normal
  if normal.dot(Vector3.UP)<.25:continue
  wheel_contacts+=1
  var contact:Vector3=hit.position;var offset=contact-global_position;var velocity_at=linear_velocity+angular_velocity.cross(offset);var distance=from.distance_to(contact)
  var spring=mass*9.81/(4*.09);var damping=2*sqrt(spring*mass/4)*.72
  var suspension=clampf((.99-distance)*spring-velocity_at.dot(normal)*damping,0,mass*9.81*.9)
  apply_force(normal*suspension,offset)
  var angle=steering*.5/(1+absf(speed_mps)/22) if i<2 else 0.0
  var wheel_forward=forward.rotated(global_basis.y,-angle).slide(normal).normalized();var right=wheel_forward.cross(normal).normalized()
  var side_speed=velocity_at.dot(right);var grip=.25 if braking and i>=2 else 1.0
  var friction_limit=maxf(suspension,mass*9.81*.12)*(1.05 if not braking else .8)
  var lateral=clampf(-side_speed*mass*.7*grip,-friction_limit,friction_limit);apply_force(right*lateral,offset)
  var max_speed=float(definition.maxSpeed)/10;var engine=mass*(float(definition.accel)*.0135)*maxf(.12,1-pow(absf(speed_mps)/max_speed,1.7))
  var longitudinal=0.0
  if throttle>0:longitudinal=engine*throttle/4 if speed_mps>-.8 else mass*8*throttle/4
  elif throttle<0:longitudinal=mass*8*throttle/4 if speed_mps>.8 else engine*.42*throttle/4
  if braking:longitudinal-=clampf(speed_mps*mass*.8,-mass*3,mass*3)/4
  apply_force(wheel_forward*longitudinal,offset)
 apply_central_force(-linear_velocity*linear_velocity.length()*.45)
 _animate_wheels(delta)
func _animate_wheels(delta):
 wheel_spin-=speed_mps*delta/.34
 for w in wheel_nodes:
  var axis=Vector3.RIGHT if kind in ROTATED else Vector3.FORWARD
  w.node.quaternion=w.rest*Quaternion(axis,wheel_spin)
  if w.front:w.node.quaternion=Quaternion(Vector3.UP,-steering*.4)*w.node.quaternion
func _autopilot():
 if ai_target==Vector3.ZERO or global_position.distance_to(ai_target)<4:
  var forward=global_basis.x
  var horiz=absf(forward.x)>absf(forward.z)
  if horiz:ai_target=Vector3(clampf(roundf(global_position.x/60)*60+signf(forward.x)*60,12,468),0,roundf(global_position.z/60)*60+1.6)
  else:ai_target=Vector3(roundf(global_position.x/60)*60-1.6,0,clampf(roundf(global_position.z/60)*60+signf(forward.z)*60,12,468))
 var dir=(ai_target-global_position).normalized();var angle=atan2(global_basis.x.cross(dir).y,global_basis.x.dot(dir));steer=clampf(-angle*2,-1,1);throttle=1.0 if absf(speed_mps)<9 else 0.0;braking=absf(angle)>1.3
func _impact(other):
 if impact_cooldown>0 or last_speed<3:return
 impact_cooldown=.35;hp=maxf(0,hp-maxf(0,last_speed-3)*2.5)
 if audio_node:audio_node.play_at("impact",global_position,-2,clampf(1.2-mass/7000,.65,1.2))
func nearest_door(point):
 var left=to_global(Vector3(length_m*.08,0,-width_m/2-.65));var right=to_global(Vector3(length_m*.08,0,width_m/2+.65));return left if point.distance_to(left)<point.distance_to(right) else right
func can_enter(point):
 if driver!=0 or absf(speed_mps)>1.8 or global_basis.y.dot(Vector3.UP)<.5:return false
 var local=to_local(point);var dx=maxf(0,absf(local.x)-length_m/2);var dz=maxf(0,absf(local.z)-width_m/2);return Vector2(dx,dz).length()<2.5
func safe_exit(pawn):
 var state=get_world_3d().direct_space_state
 for side in [-1,1]:
  for extra in [0.0,.7,1.4]:
   var point=to_global(Vector3(length_m*.08,0,side*(width_m/2+.65+extra)));var ray=PhysicsRayQueryParameters3D.create(point+Vector3.UP*2,point-Vector3.UP*3,1);var ground=state.intersect_ray(ray)
   if ground.is_empty():continue
   point.y=ground.position.y+.04
   var capsule=CapsuleShape3D.new();capsule.radius=.42;capsule.height=1.8
   var q=PhysicsShapeQueryParameters3D.new();q.shape=capsule;q.transform=Transform3D(Basis.IDENTITY,point+Vector3.UP*.95);q.collision_mask=1|2;q.exclude=[get_rid(),pawn.get_rid()]
   if state.intersect_shape(q,1).is_empty():return point
 return null
func reset_upright():
 var heading=atan2(global_basis.x.z,global_basis.x.x);global_basis=Basis(Vector3.UP,-heading);global_position.y=1.1;linear_velocity=Vector3.ZERO;angular_velocity=Vector3.ZERO;sleeping=false
func snapshot(c):
 networked=true;freeze=true;driver=int(c.get("d",0));hp=float(c.get("h",100));speed_mps=float(c.s)/10;steering=float(c.get("st",0));net_target=Vector3(float(c.x)/10,0,float(c.y)/10);net_yaw=-float(c.a)
 if not net_seen or global_position.distance_to(net_target)>12:global_position=net_target;rotation.y=net_yaw
 net_seen=true
