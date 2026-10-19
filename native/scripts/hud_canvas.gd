extends Control
# Native CanvasItem HUD (10 Hz redraw). Design system: Veyra dark glass + mint/gold accents.
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
func text_center(text,center,size,color):
 draw_string(font,center-Vector2(font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,size).x*.5,size*.32),text,HORIZONTAL_ALIGNMENT_LEFT,-1,size,color)
func _draw():
 if not app or not app.playing or not app.player:return
 var ink=Color("eaf3ee");var muted=Color("8fa9b2");var mint=Color("8fe8c4");var gold=Color("e8c88a")
 var track=Color(1,1,1,.10)
 var card=StyleBoxFlat.new();card.bg_color=Color("0b1620d9");card.border_color=Color("2e5b6340");card.set_border_width_all(1);card.set_corner_radius_all(12)
 var x=insets.x
 var vital_y=size.y-(176 if touch_mode else 26)-maxf(0,insets.w-18)
 # Vitals card
 draw_style_box(card,Rect2(x-6,vital_y-38,196,52))
 text_at("HP",Vector2(x+2,vital_y-19),9,muted)
 draw_line(Vector2(x+22,vital_y-22),Vector2(x+172,vital_y-22),track,6,true)
 var hp=Color("8fd6a8") if health>30 else Color("e07a6e")
 draw_line(Vector2(x+22,vital_y-22),Vector2(x+22+150*clampf(health/100,0,1),vital_y-22),hp,6,true)
 text_at(str(int(health)),Vector2(x+178,vital_y-18),10,hp)
 text_at("EN",Vector2(x+2,vital_y-4),9,muted)
 draw_line(Vector2(x+22,vital_y-7),Vector2(x+172,vital_y-7),track,3,true)
 draw_line(Vector2(x+22,vital_y-7),Vector2(x+22+150*clampf(stamina,0,1),vital_y-7),mint,3,true)
 # heart glyph
 draw_colored_polygon(PackedVector2Array([Vector2(x-1,vital_y-24),Vector2(x-6,vital_y-28),Vector2(x-11,vital_y-25),Vector2(x-11,vital_y-20),Vector2(x-1,vital_y-12),Vector2(x+9,vital_y-20),Vector2(x+9,vital_y-25),Vector2(x+4,vital_y-28)]),Color("db8d7f"))
 # Money chip
 var cash_w=148.0
 var cash_x=size.x-(348 if touch_mode else cash_w+34)-maxf(0,insets.y-18)
 var money=StyleBoxFlat.new();money.bg_color=Color("0b1620e6");money.border_color=Color("e8c88a4d");money.set_border_width_all(1);money.set_corner_radius_all(11)
 draw_style_box(money,Rect2(cash_x-12,14,cash_w,42))
 draw_colored_polygon(PackedVector2Array([Vector2(cash_x+4,26),Vector2(cash_x+12,26),Vector2(cash_x+12,22),Vector2(cash_x+17,26),Vector2(cash_x+17,38),Vector2(cash_x+12,42),Vector2(cash_x+12,38),Vector2(cash_x+4,38),Vector2(cash_x+4,43),Vector2(cash_x-1,38),Vector2(cash_x-1,26),Vector2(cash_x+4,22)]),gold)
 text_at(str(cash),Vector2(cash_x+26,43),21,ink)
 text_at("VEYRA CASH",Vector2(cash_x+26,20),8,Color("7d958c"))
 # Speedometer
 if vehicle_name!="":
  var cy=Vector2(size.x*.5,size.y-(58 if touch_mode else 44)-maxf(0,insets.w-18))
  var w=224.0;var h=88.0
  draw_style_box(card,Rect2(cy-Vector2(w*.5,h*.5),Vector2(w,h)))
  var gauge=cy+Vector2(-w*.5+58,6)
  draw_arc(gauge,34,deg_to_rad(150),deg_to_rad(390),26,track,5,true)
  var frac=clampf(speed/220.0,0,1)
  draw_arc(gauge,34,deg_to_rad(150),deg_to_rad(150)+deg_to_rad(240)*frac,26,mint if frac<.82 else gold,5,true)
  for i in range(5):
   var ang=deg_to_rad(150)+deg_to_rad(60)*i
   draw_line(gauge+Vector2(cos(ang),sin(ang))*27,gauge+Vector2(cos(ang),sin(ang))*31,Color(1,1,1,.22),1.5,true)
  text_center("%03d"%int(speed),gauge+Vector2(0,10),26,ink)
  text_center("KM/H",gauge+Vector2(0,26),9,muted)
  text_at(vehicle_name.to_upper(),cy+Vector2(20,-16),13,ink)
  var gear="R" if app.player.driving.speed_mps<-.3 else ("N" if absf(app.player.driving.speed_mps)<.25 else "D")
  text_at("GEAR "+gear,cy+Vector2(20,2),10,mint)
  text_at("SPD",cy+Vector2(20,18),8,muted)
func panel(color):
 var p=StyleBoxFlat.new();p.bg_color=color;p.border_color=Color(.45,.68,.65,.23);p.set_border_width_all(1);p.set_corner_radius_all(8);return p
