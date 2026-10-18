extends Control

signal action(name,pressed)
var enabled=false
var axis=Vector2.ZERO
var look=Vector2.ZERO
var held={"fire":false,"brake":false,"voice":false}
var stick_id=-1
var look_id=-1
var origin=Vector2.ZERO
var last_look=Vector2.ZERO
var stick_pos=Vector2.ZERO
var buttons={}
var driving=false
func _ready():
 set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);mouse_filter=Control.MOUSE_FILTER_IGNORE
 enabled=OS.has_feature("mobile") or "--touch" in OS.get_cmdline_user_args();visible=enabled
 for spec in [["fire","FIRE",Vector2(-92,-180),68],["action","NAIK",Vector2(-170,-115),60],["brake","JUMP",Vector2(-88,-95),60],["horn","HORN",Vector2(-155,-38),48],["menu","•••",Vector2(-55,15),44],["gps","GPS",Vector2(-107,15),44],["chat","CHAT",Vector2(-159,15),44],["ragdoll","RAG",Vector2(-211,15),44]]:
  var b=Button.new();b.text=spec[1];b.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT);b.size=Vector2(spec[3],spec[3]);b.set_meta("offset",spec[2]);b.set_meta("key",spec[0]);b.focus_mode=Control.FOCUS_NONE;b.add_theme_font_size_override("font_size",12);add_child(b);buttons[spec[0]]=b
  var key=spec[0];b.button_down.connect(func():_button(key,true));b.button_up.connect(func():_button(key,false))
 resized.connect(_layout);_layout()
func _layout():
 for b in buttons.values():
  var p=b.get_meta("offset");b.position=Vector2(size.x+p.x,p.y if p.y>=0 else size.y+p.y)
func _button(key,on):
 if held.has(key):held[key]=on
 action.emit(key,on)
func set_driving(value):
 driving=value
 if buttons.has("action"):buttons.action.text="TURUN" if value else "NAIK";buttons.brake.text="REM" if value else "JUMP"
func _input(event):
 if not enabled or not visible:return
 if event is InputEventScreenTouch:
  if event.pressed:
   for b in buttons.values():
    if b.get_global_rect().has_point(event.position):return
   if event.position.x<size.x*.44 and event.position.y>size.y*.35 and stick_id<0:stick_id=event.index;origin=event.position;stick_pos=origin;get_viewport().set_input_as_handled()
   elif look_id<0:look_id=event.index;last_look=event.position
  else:
   if event.index==stick_id:stick_id=-1;axis=Vector2.ZERO
   if event.index==look_id:look_id=-1
  queue_redraw()
 elif event is InputEventScreenDrag:
  if event.index==stick_id:axis=(event.position-origin)/58.0;axis=axis.limit_length(1);stick_pos=origin+axis*58;get_viewport().set_input_as_handled();queue_redraw()
  elif event.index==look_id:look+=event.position-last_look;last_look=event.position;get_viewport().set_input_as_handled()
func take_look():
 var value=look;look=Vector2.ZERO;return value
func reset():
 stick_id=-1;look_id=-1;axis=Vector2.ZERO;look=Vector2.ZERO
 for key in held:held[key]=false
 queue_redraw()
func _draw():
 if not enabled:return
 var center=origin if stick_id>=0 else Vector2(92,size.y-103)
 draw_circle(center,62,Color(.1,.22,.3,.35));draw_arc(center,62,0,TAU,48,Color(.5,.75,.78,.4),1.5)
 draw_circle(stick_pos if stick_id>=0 else center,22,Color(.65,.86,.85,.45))
