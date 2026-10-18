extends Control
var app
var center_world=Vector2.ZERO
var heading=0.0
var clock=0.0
var range_m=65.0
var dots=[]
var target=null
func _ready():
 mouse_filter=Control.MOUSE_FILTER_IGNORE;clip_contents=true
func _process(delta):
 if not is_visible_in_tree() or not app or not app.player:return
 clock+=delta
 if clock<.2:return
 clock=0;center_world=Vector2(app.player.global_position.x,app.player.global_position.z);heading=app.player.camera_yaw;dots=[]
 for c in app.vehicles.values():dots.append({"p":Vector2(c.global_position.x,c.global_position.z),"type":"car"})
 for a in app.remote.values():dots.append({"p":Vector2(a.global_position.x,a.global_position.z),"type":"person"})
 target=Vector2(app.destination.x/10.0,app.destination.y/10.0) if app.destination else null
 queue_redraw()
func project(p):
 var delta=p-center_world;var front=Vector2(cos(heading),sin(heading));var right=Vector2(-sin(heading),cos(heading));var scale=minf(size.x,size.y)/(range_m*2)
 return size*.5+Vector2(delta.dot(right),-delta.dot(front))*scale
func _draw():
 var background=StyleBoxFlat.new();background.bg_color=Color("0a1821ed");background.border_color=Color("3f666a");background.set_border_width_all(1);background.set_corner_radius_all(9);draw_style_box(background,Rect2(Vector2.ZERO,size))
 var scale=minf(size.x,size.y)/(range_m*2)
 for i in range(9):
  var at=i*60.0
  draw_line(project(Vector2(at,-30)),project(Vector2(at,510)),Color("344751"),maxf(1,9.6*scale),true)
  draw_line(project(Vector2(-30,at)),project(Vector2(510,at)),Color("344751"),maxf(1,9.6*scale),true)
 if target:
  var end=project(target);draw_line(size*.5,end,Color("7ec7bb"),1.6,true)
  draw_circle(end.clamp(Vector2(7,7),size-Vector2(7,7)),4,Color("e1cb86"))
 for d in dots:
  var p=project(d.p)
  if Rect2(Vector2(4,4),size-Vector2(8,8)).has_point(p):draw_circle(p,2.1,Color("c7c9ba") if d.type=="car" else Color("7dc9d6"))
 var c=size*.5
 draw_colored_polygon(PackedVector2Array([c+Vector2(0,-7),c+Vector2(-4,5),c+Vector2(0,2),c+Vector2(4,5)]),Color("d8ecd5"))
 draw_string(ThemeDB.fallback_font,Vector2(8,14),"NEON / GPS",HORIZONTAL_ALIGNMENT_LEFT,-1,8,Color("a4bdbb"))
