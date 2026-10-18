extends Control
# True per-pointer controls; not mouse-emulated Buttons, so steering + gas + look work together.
signal action(name,pressed)

class ActionPad extends Control:
 signal changed(key,on)
 var key=""
 var caption=""
 var down=false
 var pointer=-1
 var accent=Color("9de1cc")
 func _ready():mouse_filter=Control.MOUSE_FILTER_STOP
 func set_down(value):
  if down==value:return
  down=value;queue_redraw();changed.emit(key,value)
 func _gui_input(event):
  if event is InputEventScreenTouch:
   if event.pressed and pointer==-1:pointer=event.index;set_down(true);accept_event()
   elif not event.pressed and event.index==pointer:pointer=-1;set_down(false);accept_event()
  elif event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT:
   if event.pressed and pointer==-1:pointer=-2;set_down(true);accept_event()
   elif not event.pressed and pointer==-2:pointer=-1;set_down(false);accept_event()
 func clear():pointer=-1;set_down(false)
 func _draw():
  var center=size*.5;var r=minf(size.x,size.y)*.5-2
  draw_circle(center,r,Color(.055,.09,.12,.8) if not down else Color(.18,.36,.34,.94))
  draw_arc(center,r,0,TAU,40,Color(accent,.55 if not down else 1),1.4,true)
  if key in ["gas","reverse"]:
   var box=Rect2(center-Vector2(10,16),Vector2(20,23));draw_style_box(_pedal_style(),box)
   for y in [-10,-4,2]:draw_line(center+Vector2(-6,y),center+Vector2(6,y),accent,1.4,true)
  elif key in ["left","right"]:
   var sign=-1 if key=="left" else 1
   draw_polyline(PackedVector2Array([center+Vector2(-sign*4,-9),center+Vector2(sign*6,0),center+Vector2(-sign*4,9)]),accent,2.5,true)
  elif key=="fire" or key=="aim":
   draw_arc(center-Vector2(0,5),10,0,TAU,24,accent,1.4,true)
   for d in [Vector2.RIGHT,Vector2.LEFT,Vector2.UP,Vector2.DOWN]:draw_line(center-Vector2(0,5)+d*7,center-Vector2(0,5)+d*14,accent,1.2,true)
  elif key=="jump":
   draw_polyline(PackedVector2Array([center+Vector2(-8,-1),center+Vector2(0,-10),center+Vector2(8,-1)]),accent,2,true);draw_line(center+Vector2(0,-10),center+Vector2(0,8),accent,2,true)
  var font=get_theme_default_font();var font_size=10 if size.x>=52 else 9
  var y=center.y+22 if key in ["gas","reverse","fire","aim","jump"] else center.y+4
  var width=font.get_string_size(caption,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x
  draw_string(font,Vector2(center.x-width/2,y),caption,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size,accent)
 func _pedal_style():
  var style=StyleBoxFlat.new();style.bg_color=Color(accent,.17);style.border_color=accent;style.set_border_width_all(1);style.set_corner_radius_all(3);return style

var enabled=false
var axis=Vector2.ZERO
var look=Vector2.ZERO
var held={"fire":false,"aim":false,"jump":false,"brake":false,"gas":false,"reverse":false,"left":false,"right":false}
var sprint_toggle=false
var stick_id=-1
var look_id=-1
var origin=Vector2.ZERO
var last_look=Vector2.ZERO
var stick_pos=Vector2.ZERO
var buttons={}
var driving=false
var safe_margin=Vector2.ZERO
var bottom_inset=0.0
func _ready():
 set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);mouse_filter=Control.MOUSE_FILTER_IGNORE
 enabled=OS.has_feature("mobile") or "--touch" in OS.get_cmdline_user_args();visible=enabled
 var specs=[["fire","FIRE",88],["aim","AIM",70],["action","NAIK",76],["jump","JUMP",74],["sprint","RUN",62],["gas","GAS",94],["reverse","REM / R",84],["brake","H-BRAKE",70],["left","",80],["right","",80],["horn","HORN",62],["menu","•••",52],["gps","GPS",52],["chat","CHAT",52]]
 for spec in specs:
  var pad=ActionPad.new();pad.key=spec[0];pad.caption=spec[1];pad.size=Vector2(spec[2],spec[2]);pad.set_meta("base_size",float(spec[2]));pad.changed.connect(_button);add_child(pad);buttons[spec[0]]=pad
 resized.connect(_layout);_layout();_visibility()
func _layout():
 var w=size.x;var h=size.y
 var base=clampf(minf(w/1280.0,h/720.0),.78,1.18)
 for key in buttons:
  var side=maxf(52.0,float(buttons[key].get_meta("base_size",64.0))*base)
  buttons[key].size=Vector2(side,side)
 var s=buttons.fire.size.x
 var positions={"fire":Vector2(w-72*base,h-170*base),"aim":Vector2(w-152*base,h-226*base),"action":Vector2(w-156*base,h-124*base),"jump":Vector2(w-78*base,h-82*base),"sprint":Vector2(186*base,h-118*base),"gas":Vector2(w-74*base,h-106*base),"reverse":Vector2(w-166*base,h-86*base),"brake":Vector2(w-238*base,h-168*base),"left":Vector2(82*base,h-108*base),"right":Vector2(164*base,h-108*base),"horn":Vector2(w-74*base,h-232*base),"menu":Vector2(w-38*base,38*base),"gps":Vector2(w-94*base,38*base),"chat":Vector2(w-150*base,38*base)}
 if driving:positions.action=Vector2(w-158*base,h-228*base)
 for key in buttons:
  var pad=buttons[key]
  if key in ["left","right","sprint"]:positions[key].x+=safe_margin.x
  else:positions[key].x-=safe_margin.y
  if key not in ["menu","gps","chat"]:positions[key].y-=bottom_inset
  var half=pad.size*.5
  var desired=positions[key]-half
  desired.x=clampf(desired.x,6.0,maxf(6.0,w-pad.size.x-6.0))
  desired.y=clampf(desired.y,6.0,maxf(6.0,h-pad.size.y-6.0))
  pad.position=desired
func set_insets(left,right,bottom):
 safe_margin=Vector2(left,right);bottom_inset=bottom;_layout()
func _visibility():
 for key in buttons:
  buttons[key].visible=(key in ["menu","gps","chat","action"]) or (driving and key in ["gas","reverse","brake","left","right","horn"]) or (not driving and key in ["fire","aim","jump","sprint"])
func _button(key,on):
 if held.has(key):held[key]=on
 if key=="sprint" and on:sprint_toggle=not sprint_toggle;buttons.sprint.accent=Color("e5d68f") if sprint_toggle else Color("9de1cc");buttons.sprint.queue_redraw()
 action.emit(key,on)
func set_driving(value):
 if driving==value:return
 driving=value;reset();buttons.action.caption="TURUN" if value else "NAIK";buttons.action.queue_redraw();_layout();_visibility()
func _input(event):
 if not enabled or not is_visible_in_tree():return
 if event is InputEventScreenTouch:
  if event.pressed:
   for b in buttons.values():
    if b.is_visible_in_tree() and b.get_global_rect().has_point(event.position):return
   if event.position.x<size.x*.48 and event.position.y>size.y*.34 and stick_id<0:
    stick_id=event.index;origin=event.position;stick_pos=origin;get_viewport().set_input_as_handled()
   elif look_id<0:look_id=event.index;last_look=event.position
  else:
   if event.index==stick_id:stick_id=-1;axis=Vector2.ZERO
   if event.index==look_id:look_id=-1
  queue_redraw()
 elif event is InputEventScreenDrag:
  if event.index==stick_id:axis=((event.position-origin)/58.0).limit_length(1);stick_pos=origin+axis*58;get_viewport().set_input_as_handled();queue_redraw()
  elif event.index==look_id:look+=event.position-last_look;last_look=event.position;get_viewport().set_input_as_handled()
func read_move():
 if not driving:return axis
 var turn=clampf(axis.x+float(held.right)-float(held.left),-1,1)
 var throttle=float(held.gas)-float(held.reverse)
 if absf(throttle)<.01:throttle=-axis.y
 return Vector2(turn,-throttle)
func wants_sprint():return sprint_toggle or axis.length()>.9
func take_look():
 var value=look;look=Vector2.ZERO;return value
func reset():
 stick_id=-1;look_id=-1;axis=Vector2.ZERO;look=Vector2.ZERO;sprint_toggle=false
 for key in held:held[key]=false
 for b in buttons.values():b.pointer=-1;b.down=false;b.queue_redraw()
 if buttons.has("sprint"):buttons.sprint.accent=Color("9de1cc")
 queue_redraw()
func _draw():
 if not enabled:return
 if driving:return
 var center=origin if stick_id>=0 else Vector2(104+safe_margin.x,size.y-124-bottom_inset)
 draw_circle(center,74,Color(.045,.08,.11,.62));draw_arc(center,74,0,TAU,56,Color(.6,.85,.8,.42),1.8,true)
 draw_circle(stick_pos if stick_id>=0 else center,28,Color(.55,.78,.74,.62))
