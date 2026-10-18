extends SceneTree
# Real Godot/Jolt integration: no mocked physics, renderer or transform math.
var checks=0
var failures=0
func check(value,label):
 checks+=1
 if not value:failures+=1;push_error("PHYSICS_ASSERT "+label)
func _initialize():call_deferred("run")
func run():
 var scene=Node3D.new();root.add_child(scene)
 var ground=StaticBody3D.new();ground.collision_layer=1;var c=CollisionShape3D.new();var box=BoxShape3D.new();box.size=Vector3(100,.2,100);c.shape=box;ground.add_child(c);scene.add_child(ground);ground.position.y=-.1
 var wall=StaticBody3D.new();wall.collision_layer=1;var wc=CollisionShape3D.new();var wb=BoxShape3D.new();wb.size=Vector3(.08,3,12);wc.shape=wb;wall.add_child(wc);scene.add_child(wall);wall.position=Vector3(3,1.5,0)
 var Pawn=load("res://scripts/pawn.gd");var p=Pawn.new();scene.add_child(p);p.setup(0,0);p.global_position=Vector3(0,.06,0);p.enabled=true;p.camera_yaw=0
 for i in range(10):await physics_frame
 p.controls={"move":Vector2(0,-1),"sprint":true,"jump":false,"crouch":false,"aim":false}
 for i in range(90):await physics_frame
 check(p.global_position.x>1,"capsule moves from real controls");check(p.global_position.x<2.64,"capsule cannot cross a thin 3D wall");check(p.global_position.y>-.1,"floor collision")
 var front=p.avatar.global_basis.z.normalized();check(front.dot(Vector3.RIGHT)>.9,"W turns the actual mesh forwards, not at camera")
 p.controls.jump=true
 for i in range(16):await physics_frame
 check(p.global_position.y>.1,"native gravity/jump uses vertical physics")
 p.controls.jump=false;p.controls.move=Vector2.ZERO
 for i in range(110):await physics_frame
 check(p.global_position.y<.12,"jump lands on floor")
 p.global_position=Vector3(-8,.06,-8);p.velocity=Vector3.ZERO;p.knockdown(Vector3(2,1,0),4)
 for i in range(180):await physics_frame
 check(p.avatar.ragdoll,"physical skeleton simulation active")
 for b in p.avatar.physical:check(b.global_position.is_finite() and b.global_position.y>-.3,"physical bone contact "+b.name)
 p.recover();check(not p.avatar.ragdoll,"recovery restores animated skeleton")
 var Car=load("res://scripts/vehicle.gd");var car=Car.new();scene.add_child(car);var types=JSON.parse_string(FileAccess.get_file_as_string("res://assets/district.json")).types
 car.configure({"id":9001,"type":"sedan","x":-180,"y":120,"a":0},types,0);car.freeze=false;car.global_position.y=.4
 for i in range(180):await physics_frame
 check(car.global_position.is_finite(),"vehicle body finite after suspension settles");check(car.wheel_contacts>=2,"ray suspension finds real ground contacts");check(car.global_position.y>-.15 and car.global_position.y<.8,"vehicle rests on suspension, not through floor")
 var before=car.global_position;car.set_drive(1,0,false)
 for i in range(120):await physics_frame
 check(car.global_position.distance_to(before)>2,"engine tyre forces propel a native RigidBody3D");check(car.speed_mps>1,"native speed from physics body velocity")
 car.set_drive(0,.7,true)
 for i in range(90):await physics_frame
 check(car.global_position.is_finite() and car.angular_velocity.is_finite(),"brake/steer remain finite")
 print("NATIVE_PHYSICS_", "PASS" if failures==0 else "FAIL", " checks=",checks," failures=",failures," suspensionContacts=",car.wheel_contacts)
 quit(0 if failures==0 else 1)
