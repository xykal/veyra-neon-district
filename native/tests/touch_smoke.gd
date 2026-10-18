extends SceneTree
var checks=0
var failures=0
func check(value,label):
 checks+=1
 if not value:failures+=1;push_error("TOUCH_ASSERT "+label)
func event(index,pressed,position=Vector2.ZERO):
 var e=InputEventScreenTouch.new();e.index=index;e.pressed=pressed;e.position=position;return e
func _initialize():call_deferred("run")
func run():
 var scene=Control.new();scene.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.add_child(scene)
 var Touch=load("res://scripts/touch_controls.gd");var touch=Touch.new();scene.add_child(touch);touch.enabled=true;touch.visible=true;touch.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT);touch.size=Vector2(1280,720)
 await process_frame
 touch.set_driving(true)
 var left=touch.buttons.left;var gas=touch.buttons.gas
 left._gui_input(event(1,true,left.size/2));gas._gui_input(event(2,true,gas.size/2))
 check(touch.held.left and touch.held.gas,"two independent fingers hold steering and gas")
 check(touch.read_move().x<-.9 and touch.read_move().y<-.9,"simultaneous left steering and positive throttle")
 touch._input(event(3,true,Vector2(700,250)))
 var drag=InputEventScreenDrag.new();drag.index=3;drag.position=Vector2(740,263);touch._input(drag)
 check(touch.take_look().x>30,"third finger can look while pedals are held")
 gas._gui_input(event(2,false,gas.size/2))
 check(touch.held.left and not touch.held.gas,"releasing gas does not release steering")
 var duplicate=InputEventMouseButton.new();duplicate.button_index=MOUSE_BUTTON_LEFT;duplicate.pressed=false;left._gui_input(duplicate)
 check(touch.held.left,"emulated mouse release cannot steal a touch pointer")
 left._gui_input(event(1,false,left.size/2));check(not touch.held.left,"original finger releases its own pad")
 touch.reset();check(touch.read_move()==Vector2.ZERO and touch.look_id<0,"focus/pause reset clears all controls")
 touch.set_driving(false);check(touch.buttons.jump.visible and not touch.buttons.gas.visible,"foot/driver layouts are mode-specific")
 touch._input(event(4,true,Vector2(85,610)));drag=InputEventScreenDrag.new();drag.index=4;drag.position=Vector2(85,558);touch._input(drag)
 check(touch.read_move().y<-.7,"foot joystick generates analog forward input")
 touch.buttons.aim._gui_input(event(5,true));touch.buttons.fire._gui_input(event(6,true))
 check(touch.held.aim and touch.held.fire and touch.axis.length()>.7,"move, aim and fire can coexist")
 touch.reset()
 for viewport in [Vector2(1280,720),Vector2(1600,720),Vector2(960,540)]:
  touch.size=viewport;touch._layout()
  for driving in [false,true]:
   touch.set_driving(driving)
   for pad in touch.buttons.values():
    if not pad.visible:continue
    check(pad.position.x>=0 and pad.position.y>=0 and pad.position.x+pad.size.x<=viewport.x+.1 and pad.position.y+pad.size.y<=viewport.y+.1,"active touch pad within viewport")
 print("NATIVE_TOUCH_","PASS" if failures==0 else "FAIL"," checks=",checks," failures=",failures)
 call_deferred("finish")
func finish():quit(0 if failures==0 else 1)
