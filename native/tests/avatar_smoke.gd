extends SceneTree
var checks=0
func check(value,message):
 checks+=1
 if not value:push_error(message);quit(1)
func _initialize():call_deferred("run")
func run():
 var scene=Node3D.new();root.add_child(scene)
 var floor=StaticBody3D.new();var collision=CollisionShape3D.new();var shape=BoxShape3D.new();shape.size=Vector3(20,.2,20);collision.shape=shape;floor.add_child(collision);scene.add_child(floor);floor.position.y=-.1
 var Avatar=load("res://scripts/avatar.gd")
 var a=Avatar.new();scene.add_child(a);a.setup(0,1)
 print("Native model bones=",a.skeleton.get_bone_count()," clips=",a.animator.get_animation_list())
 check(a.skeleton.get_bone_count()==65,"Artist mesh skeleton missing")
 check(a.animator.has_animation("Idle"),"Authored idle clip missing")
 check(a.physical.is_empty(),"Ragdoll bodies must be lazy while animated")
 a.play_motion("Jog_Fwd_Loop")
 for i in range(30):await physics_frame
 a.position.y=1.0;a.start_ragdoll(Vector3(1,0,0))
 for b in a.physical:check(b.get_bone_id()>=0,"Physical bone failed binding: "+b.name)
 for i in range(180):await physics_frame
 print("Ragdoll body positions: ",a.physical.map(func(b):return b.global_position))
 for b in a.physical:check(b.global_position.is_finite(),"Ragdoll non-finite");check(b.global_position.y>-.5 and b.global_position.y<3.5,"Ragdoll unstable or through floor")
 print("AVATAR_SMOKE_PASS checks=",checks);quit(0)
