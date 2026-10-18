extends Control
# Cheap native CanvasItem HUD. Redraw at 10 Hz; no blur/backbuffer or per-frame text layout.
var app
var touch_mode=false
var health=100.0
var stamina=1.0
var speed=0.0
var vehicle_name=""
var cash=0
var clock=0.0
var insets=Vector4(18,18,18,18)
var font
func _ready():
 mouse_filter=Control.MOUSE_FILTER_IGNORE;set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);font=ThemeDB.fallback_font
func _process(delta):
 clock+=delta
 if clock>=.1:
  clock=0
  if app and app.player:
   health=app.player.health;stamina=app.player.stamina;cash=app.money;touch_mode=app.ui.touch.enabled
   speed=absf(app.player.driving.speed_mps)*3.6 if app.player.driving else 0.0
   vehicle_name=str(app.player.driving.definition.label) if app.player.driving else ""
  queue_redraw()
func text_at(text,pos,size,color):draw_string(font,pos,text,HORIZONTAL_ALIGNMENT_LEFT,-1,size,color)
func _draw():
 if not app or not app.playing or not app.player:return
 var ink=Color("e7efe9");var muted=Color("8ca8b0");var mint=Color("a3dbc5");var bg=Color(.025,.055,.08,.83)
 var x=insets.x;var vital_y=size.y-(182 if touch_mode else 28)-maxf(0,insets.w-18)
 draw_style_box(panel(bg),Rect2(x-4,vital_y-32,174,43))
 # Heart and stamina glyphs with actual game values, not fake armour/fuel bars.
 draw_polyline(PackedVector2Array([Vector2(x+1,vital_y-16),Vector2(x+5,vital_y-20),Vector2(x+9,vital_y-17),Vector2(x+13,vital_y-20),Vector2(x+17,vital_y-16),Vector2(x+9,vital_y-8),Vector2(x+1,vital_y-16)]),Color("db8d7f"),1.5,true)
 draw_line(Vector2(x+25,vital_y-15),Vector2(x+151,vital_y-15),Color(.2,.28,.31,.8),5,true)
 draw_line(Vector2(x+25,vital_y-15),Vector2(x+25+126*clampf(health/100,0,1),vital_y-15),Color("b4d99b") if health>30 else Color("dc8979"),5,true)
 draw_line(Vector2(x+25,vital_y),Vector2(x+151,vital_y),Color(.2,.28,.31,.8),3,true)
 draw_line(Vector2(x+25,vital_y),Vector2(x+25+126*clampf(stamina,0,1),vital_y),mint,3,true)
 draw_polyline(PackedVector2Array([Vector2(x+10,vital_y-6),Vector2(x+5,vital_y+1),Vector2(x+10,vital_y+1),Vector2(x+7,vital_y+6)]),mint,1.2,true)
 var cash_x=size.x-(348 if touch_mode else 165)-maxf(0,insets.y-18)
 draw_style_box(panel(bg),Rect2(cash_x-12,16,142,39));text_at("$ "+str(cash),Vector2(cash_x,42),22,ink)
 if vehicle_name!="":
  var center=Vector2(size.x*.5,size.y-54)
  draw_style_box(panel(bg),Rect2(center-Vector2(89,42),Vector2(178,76)))
  text_at("%03d"%int(speed),center+Vector2(-55,8),42,ink);text_at("KM/H",center+Vector2(27,5),10,muted)
  var gear="R" if app.player.driving.speed_mps<-.3 else "D"
  text_at(gear,center+Vector2(67,7),17,mint);text_at(vehicle_name.to_upper(),center+Vector2(-55,25),10,muted)
func panel(color):
 var p=StyleBoxFlat.new();p.bg_color=color;p.border_color=Color(.45,.68,.65,.23);p.set_border_width_all(1);p.set_corner_radius_all(8);return p
