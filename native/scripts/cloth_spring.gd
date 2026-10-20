extends Node3D
class_name ClothSpring
# FiveM-style cloth dynamics for worn attachments (hood, bag, chain, jacket, hair).
# The piece lags behind the owner's motion: velocity swing + turn tilt + gravity sag
# + soft bob, damped-spring smoothed. Pure GDScript, no physics server cost.
var base_position=Vector3.ZERO
var base_rotation=Vector3.ZERO
var sway=Vector3.ZERO
var tilt=Vector3.ZERO
var phase=0.0
var swing_amount=0.055
var tilt_amount=0.55
var bob_amount=0.012
var stiff=7.5
var local_vel=Vector3.ZERO
var yaw_rate=0.0
var gravity_sag=0.012
var skeleton:Skeleton3D
var bone_a=-1
var bone_b=-1
var bone_amp=0.35

func _ready():
 base_position=position
 base_rotation=rotation
 phase=randf()*6.283

func bind_bones(skel:Skeleton3D,name_a:String,name_b:String,amp=0.35):
 skeleton=skel;bone_amp=amp
 if skeleton:
  bone_a=skeleton.find_bone(name_a);bone_b=skeleton.find_bone(name_b)
 process_priority=100
 return self

func configure(swing,tilt_amt,bob):
 swing_amount=swing
 tilt_amount=tilt_amt
 bob_amount=bob
 return self

func push(velocity_world:Vector3,yaw:float,owner_basis:Basis):
 local_vel=owner_basis.inverse()*velocity_world
 yaw_rate=yaw

func _process(delta):
 var t=1.0-exp(-delta*stiff)
 var target=Vector3(-local_vel.x,0.0,-local_vel.z).limit_length(6.0)*swing_amount*0.16
 target.y-=gravity_sag*clampf(local_vel.length()*0.12,0.25,1.0)
 target.x+=yaw_rate*swing_amount*0.9
 sway=sway.lerp(target,t)
 var bob=sin(Time.get_ticks_msec()*0.0016+phase)*bob_amount*clampf(local_vel.length()*0.22,0.15,1.0)
 position=base_position+sway+Vector3(0.0,bob,0.0)
 var target_tilt=Vector3(sway.z,0.0,-sway.x)*tilt_amount*10.0
 target_tilt.x+=yaw_rate*tilt_amount*0.8
 tilt=tilt.lerp(target_tilt,t)
 rotation=base_rotation+tilt
 if skeleton and bone_a>=0:
  var swing_q=Quaternion(Vector3(1,0,0),-tilt.x*bone_amp)+Quaternion(Vector3(0,0,1),tilt.z*bone_amp*1.4)
  skeleton.set_bone_pose_rotation(bone_a,swing_q)
  if bone_b>=0:skeleton.set_bone_pose_rotation(bone_b,Quaternion(Vector3(1,0,0),-tilt.x*bone_amp*0.8))
