extends SceneTree
func _initialize():call_deferred("run")
func run():
 var glb=load("res://assets/people/citizen_male.glb").instantiate()
 root.add_child(glb)
 var anim=glb.find_child("AnimationPlayer",true,false)
 print("NAMES=",anim.get_animation_list())
 OS.delay_msec(80);quit(0)
