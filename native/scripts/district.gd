extends Node3D
# One terrain surface + instanced facades + Lombok-inspired island shell.
# City collision stays planar/shared; scenery outside the shell is visual-first.
var data={}
var island={}
var batches={}
var batch_nodes=[]
var solids=[]
var collision_chunks={}
var quality=0
var distance_limit=65.0
var environment:WorldEnvironment
var sun:DirectionalLight3D
var world_size=480.0
var generation_seconds=0.0
var material_cache={}
var mesh_cache={}
var built=false
var building=false
var collision_shape_count=0
var instance_count=0
const CHUNK=40.0

func prepare(tier=0):
 quality=tier;distance_limit=[65.0,100.0,150.0][tier]
 if data.is_empty():data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/district.json"));world_size=float(data.map.size)/10.0
 if island.is_empty():
  var raw=FileAccess.get_file_as_string("res://assets/island.json")
  if raw!="":island=JSON.parse_string(raw)
 if environment==null:_setup_environment()
func build(tier=0):
 if built:return
 prepare(tier);_generate(false,Callable())
func build_async(tier=0,progress=Callable()):
 if built:return
 prepare(tier);await _generate(true,progress)
func _progress(callback,value,text):
 if callback.is_valid():callback.call(value,text)
func _generate(incremental,progress):
 if building:return
 building=true;var started=Time.get_ticks_msec();var slice_started=Time.get_ticks_usec();var m=data.map
 _terrain();_progress(progress,.06,"Menyiapkan pulau dan jalan")
 if incremental:await get_tree().process_frame
 _island_scenery();_airport();_progress(progress,.16,"Menanam pantai, sawah, dan warung")
 if incremental:await get_tree().process_frame
 var facade=ShaderMaterial.new();facade.shader=load("res://assets/shaders/facade.gdshader")
 var fbn=load("res://assets/textures/brick/albedo.jpg");if fbn:facade.set_shader_parameter("brick_c",fbn)
 fbn=load("res://assets/textures/brick/normal.jpg");if fbn:facade.set_shader_parameter("brick_n",fbn)
 fbn=load("res://assets/textures/concrete/albedo.jpg");if fbn:facade.set_shader_parameter("concrete_c",fbn)
 fbn=load("res://assets/textures/concrete/normal.jpg");if fbn:facade.set_shader_parameter("concrete_n",fbn)
 var total=m.buildings.size()
 var kit=load("res://scripts/city_kit.gd").new();kit.setup(quality)
 var nature=load("res://scripts/nature_kit.gd").new();nature.setup(quality,self)
 for i in range(total):
  var b=m.buildings[i];var h=maxf(1.4,float(b.height)*.8);var pos=Vector3((b.x+b.w/2)/10,h/2,(b.y+b.h/2)/10);var size=Vector3(b.w/10.0,h,b.h/10.0)
  var tint=Color(b.color).lightened(.045)
  if kit.place(pos,size,tint):
   nature.place_street_props(pos,size)
  else:
   _box(pos,size,facade,"facade",tint)
  _collision_box(pos,size)
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.18+.30*float(i)/total,"Menyiapkan blok kota");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 kit.finalize(self)
 var streets=load("res://scripts/street_kit.gd").new();streets.setup(self)
 for gx in range(4,6):
  for gz in range(4,6):
   var ix=float(gx)*60.0;var iz=float(gz)*60.0
   if Vector2(ix,iz).distance_to(Vector2(240,240))<=125.0:streets.place_intersection(ix,iz)
 var trunk=_standard(0,.95);var leaves=_standard(0,.95)
 for i in range(m.trees.size()):
  var tr=m.trees[i];var tp=Vector3(tr.x/10.0,0,tr.y/10.0);var trr=float(tr.r)/10
  if not nature.place_tree(tp,trr,Color(tr.tone)):
   _tree(tr,trunk,leaves)
  else:
   _collision_box(tp+Vector3(0,trr*1.1,0),Vector3(trr*.36,trr*2.2,trr*.36))
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.52,"Menyiapkan vegetasi");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 nature.finalize(self)
 var metal=_standard(.55,.55);var wood=_standard(0,.86);var lamp=_standard(0,.25,Color("c5b06d")*.45)
 for i in range(m.props.size()):
  var p=m.props[i];var pos=Vector3(float(p.x)/10,0,float(p.y)/10)
  if p.type=="light":
   _cylinder(pos+Vector3(0,2.2,0),.07,4.4,metal,"pole",Color("414d51"));_collision_box(pos+Vector3(0,2.2,0),Vector3(.18,4.4,.18))
   _box(pos+Vector3(.3,4.4,0),Vector3(.7,.1,.18),metal,"metal",Color("414d51"));_box(pos+Vector3(.55,4.36,0),Vector3(.3,.04,.17),lamp,"lamps",Color("e5dcae"))
  elif p.type=="bench":
   _box(pos+Vector3(0,.46,0),Vector3(2,.11,.6),wood,"wood",Color("70513a"),-float(p.get("a",0)));_collision_box(pos+Vector3(0,.4,0),Vector3(2,.8,.6),-float(p.get("a",0)))
   for x in [-.75,.75]:_box(pos+Vector3(x,.22,0),Vector3(.09,.44,.4),metal,"metal",Color("414d51"))
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.60,"Menyiapkan objek jalan");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 var dark=_standard(.2,.65);var red=_standard(0,.4,Color("b33226")*.3);var green=_standard(0,.4,Color("258559")*.3)
 for i in range(9):
  for j in range(9):
   for s in [-1,1]:
    var pos=Vector3(i*60+s*6,0,j*60+s*6)
    _cylinder(pos+Vector3(0,2.2,0),.065,4.4,metal,"pole",Color("414d51"));_collision_box(pos+Vector3(0,2.3,0),Vector3(.2,4.6,.2))
    _box(pos+Vector3(0,4.4,0),Vector3(.35,1,.25),dark,"signal",Color("141b21"))
    _box(pos+Vector3(0,4.65,.14),Vector3(.18,.16,.04),red,"red",Color("c94135"));_box(pos+Vector3(0,4.15,.14),Vector3(.18,.16,.04),green,"green",Color("37a875"))
  if incremental and Time.get_ticks_usec()-slice_started>4500:await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 for w in m.water:
  var pos=Vector3((w.x+w.w/2)/10,-.02,(w.y+w.h/2)/10);var size=Vector3(w.w/10.0,.035,w.h/10.0)
  _box(pos,size,_standard(.35,.2),"water",Color("236176"))
  for edge in [-1,1]:
   var p1=pos+Vector3(edge*size.x/2,.6,0);var p2=pos+Vector3(0,.6,edge*size.z/2)
   _box(p1,Vector3(.08,1.2,size.z),metal,"fence",Color("414d51"));_collision_box(p1,Vector3(.08,1.2,size.z))
   _box(p2,Vector3(size.x,1.2,.08),metal,"fence",Color("414d51"));_collision_box(p2,Vector3(size.x,1.2,.08))
 _progress(progress,.72,"Menggabungkan render kota")
 var entries=batches.values()
 for i in range(entries.size()):
  _commit(entries[i])
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.72+.25*float(i)/entries.size(),"Mengunggah batch grafis");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 batches.clear();built=true;building=false;generation_seconds=(Time.get_ticks_msec()-started)/1000.0;_progress(progress,1.0,"Pulau siap")
func _poly_contains(poly,x,z):
 var inside=false
 for i in range(poly.size()):
  var a=poly[i];var b=poly[(i+1)%poly.size()]
  var ax=float(a[0]);var ay=float(a[1]);var bx=float(b[0]);var by=float(b[1])
  if (ay>z)!=(by>z):
   var xin=(bx-ax)*(z-ay)/(by-ay+0.00001)+ax
   if x<xin:inside=not inside
 return inside
func _poly_edge(poly,x,z):
 var best=1e9
 for i in range(poly.size()):
  var a=poly[i];var b=poly[(i+1)%poly.size()]
  var ax=float(a[0]);var ay=float(a[1]);var bx=float(b[0]);var by=float(b[1])
  var dx=bx-ax;var dy=by-ay
  var t=clampf(((x-ax)*dx+(z-ay)*dy)/(dx*dx+dy*dy+0.00001),0.0,1.0)
  best=minf(best,Vector2(x-(ax+t*dx),z-(ay+t*dy)).length())
 return best
func height_at(x,z):
 var islet_h=-999.0
 for islet in island.get("islets",[]):
  var id=Vector2(x-float(islet.x),z-float(islet.y)).length()
  if id<float(islet.r):islet_h=maxf(islet_h,0.62*(1.0-pow(id/maxf(1.0,float(islet.r)),2.0))+0.04)
 if islet_h>-900.0:return islet_h
 var poly=island.get("outline",[])
 if poly.is_empty():return 0.0
 var inside=_poly_contains(poly,x,z)
 var shore=clampf(_poly_edge(poly,x,z)/26.0,0.0,1.0)
 var h=0.22
 if inside:
  for peak in island.get("heights",[]):
   var pd=Vector2(x-float(peak.x),z-float(peak.y)).length()
   var pr=maxf(1.0,float(peak.radius))
   # Volcanic profile with a summit crater (Rinjani/Segara Anak style).
   h+=float(peak.height)*exp(-pow(pd/pr,2.0))-float(peak.height)*.26*exp(-pow(pd/(pr*.12),2.0))
  for lake in island.get("lakes",[]):
   var ld=Vector2(x-float(lake.x),z-float(lake.y)).length()
   if ld<float(lake.radius):h-=float(lake.depth)*(1.0-ld/float(lake.radius))
  for r in island.get("rice",[]):
   var local=Vector2(x-float(r.x),z-float(r.y)).rotated(-float(r.yaw))
   var hw=float(r.w)*.5;var hh=float(r.h)*.5
   if absf(local.x)<hw and absf(local.y)<hh:h+=floorf((local.y+hh)/(2*hh)*float(r.levels))*0.34
  h=lerpf(-0.32,h,shore)
 else:h=lerpf(-0.42,-3.4,shore)
 # Soft city apron: shared planar city blends into island relief without cliffs.
 var ax=absf(x-world_size*.5)-(world_size*.5+24)
 var az=absf(z-world_size*.5)-(world_size*.5+24)
 var outside_d=maxf(maxf(ax,az),0.0)
 var city_blend=1.0-smoothstep(0.0,64.0,outside_d)
 return lerpf(h,0.0,city_blend)
func _terrain():
 var geometry=MeshInstance3D.new();geometry.name="TerrainSingleSurface";geometry.set_meta("terrain_surface",true)
 var span=world_size+360.0;var origin=-180.0;var segs=84;var step=span/segs
 var verts=PackedVector3Array();var norms=PackedVector3Array();var uvs=PackedVector2Array();var indices=PackedInt32Array()
 for iz in range(segs+1):
  for ix in range(segs+1):
   var x=origin+ix*step;var z=origin+iz*step;var y=height_at(x,z)
   verts.append(Vector3(x,y,z))
   var n=Vector3(height_at(x-step,z)-height_at(x+step,z),2*step,height_at(x,z-step)-height_at(x,z+step)).normalized()
   norms.append(n);uvs.append(Vector2(x,z)*0.04)
 for iz in range(segs):
  for ix in range(segs):
   var a=iz*(segs+1)+ix;var b=a+1;var c=a+segs+1;var d=c+1
   indices.append_array(PackedInt32Array([a,c,b,b,c,d]))
 var arrays=[];arrays.resize(Mesh.ARRAY_MAX);arrays[Mesh.ARRAY_VERTEX]=verts;arrays[Mesh.ARRAY_NORMAL]=norms;arrays[Mesh.ARRAY_TEX_UV]=uvs;arrays[Mesh.ARRAY_INDEX]=indices
 var mesh=ArrayMesh.new();mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays);geometry.mesh=mesh
 var mat=ShaderMaterial.new();mat.shader=load("res://assets/shaders/terrain.gdshader");mat.set_shader_parameter("flat_radius",float(island.get("flatRadius",250.0)));mat.set_shader_parameter("world_center",Vector2(world_size/2,world_size/2));mat.set_shader_parameter("world_size",world_size)
 var tex_dir=["grass","rock","sand","asphalt","concrete"]
 for tn in tex_dir:
  var albedo=load("res://assets/textures/"+tn+"/albedo.jpg")
  if albedo:mat.set_shader_parameter(tn+"_c",albedo)
  var rgh=load("res://assets/textures/"+tn+"/rough.jpg")
  if rgh:mat.set_shader_parameter(tn+"_r",rgh)
 mat.set_shader_parameter("detail_far",90.0 if quality==0 else 150.0)
 var mask_img=load("res://assets/city_mask.png")
 if mask_img:mat.set_shader_parameter("map_tex",mask_img)
 var image=Image.create_empty(64,64,false,Image.FORMAT_RGB8);var rng=RandomNumberGenerator.new();rng.seed=192040
 for y in range(64):
  for x in range(64):
   var n=rng.randf();image.set_pixel(x,y,Color(n,n,n))
 image.generate_mipmaps();mat.set_shader_parameter("grain_tex",ImageTexture.create_from_image(image));geometry.material_override=mat;geometry.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;add_child(geometry)
 _collision_box(Vector3(world_size/2,-.15,world_size/2),Vector3(world_size+80,.3,world_size+80))
 var ocean=MeshInstance3D.new();ocean.name="OceanSurface";ocean.set_meta("ocean_surface",true);var plane=PlaneMesh.new();plane.size=Vector2(span+260,span+260);ocean.mesh=plane;ocean.position=Vector3(world_size/2,float(island.get("seaLevel",-0.55)),world_size/2)
 var ocean_mat=ShaderMaterial.new();ocean_mat.shader=load("res://assets/shaders/ocean.gdshader");ocean.material_override=ocean_mat;ocean.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;add_child(ocean)
func _ap(pos,size,mat,kind,col,yaw=0.0):_box(pos,size,mat,kind,col,yaw)
func _aplane(center,a):
 var wood2=_standard(0,.86);var dark2=_standard(.2,.65);var Y=5.75
 var rot=Basis(Vector3.UP,a);var f=Basis(Vector3.UP,a)*Basis(Vector3(0,0,1),-PI/2)
 _batch(center+Vector3(0,Y+2.3,0),f.scaled(Vector3(1.15,21,1.15)),_unit("cylinder"),wood2,"airport",Color("e7e3da"))
 _batch(center+Vector3(0,Y+2.3,0)+rot*Vector3(11.5,0,0),f.scaled(Vector3(.98,3.2,.98)),_unit("cylinder"),wood2,"airport",Color("e7e3da"))
 _ap(center+Vector3(0,Y+2.1,0)+rot*Vector3(1.2,0,0),Vector3(2.6,.3,21),wood2,"airport",Color("d8d4cb"),a)
 _ap(center+Vector3(0,Y+2.3,0)+rot*Vector3(-8.8,0,0),Vector3(1.7,.24,8.6),wood2,"airport",Color("d8d4cb"),a)
 _ap(center+Vector3(0,Y+3.8,0)+rot*Vector3(-8.6,0,0),Vector3(3.0,2.4,.24),wood2,"airport",Color("2a6f8e"),a)
 for sgn in [-1.0,1.0]:
  _ap(center+Vector3(0,Y+2.95,0)+rot*Vector3(2.2,0,sgn*1.12),Vector3(9.5,.55,.12),dark2,"airport",Color("1c2229"),a)
 _collision_box(center+Vector3(0,Y+2.5,0),Vector3(22,5.5,4.4),a)
func _airport():
 var dark=_standard(.2,.65);var metal=_standard(.55,.55);var wood=_standard(0,.86)
 var lamp=_standard(0,.25,Color("c5b06d")*.45);var white=Color("e9e6dc");var Y=5.75
 _ap(Vector3(240,Y/2,455),Vector3(352,Y,26),dark,"airport",Color("242830"))
 _ap(Vector3(228,Y/2,428),Vector3(70,Y,32),dark,"airport",Color("2c3138"))
 _ap(Vector3(240,Y/2,440),Vector3(12,Y,14),dark,"airport",Color("2c3138"))
 _collision_box(Vector3(240,Y/2,455),Vector3(352,Y,26))
 _collision_box(Vector3(228,Y/2,428),Vector3(70,Y,32))
 _collision_box(Vector3(240,Y/2,440),Vector3(12,Y,14))
 for i in range(11):
  _ap(Vector3(92+i*29.1,Y+.025,455),Vector3(5.2,.02,.55),wood,"airport",white)
 _ap(Vector3(240,Y+.025,445.4),Vector3(332,.02,.32),wood,"airport",white)
 _ap(Vector3(240,Y+.025,464.6),Vector3(332,.02,.32),wood,"airport",white)
 for sgn in [-1.0,1.0]:
  for i in range(6):
   _ap(Vector3(240+sgn*163,Y+.025,449.6+i*1.9),Vector3(3.2,.02,.85),wood,"airport",white)
  for i in range(18):
   _ap(Vector3(80+i*18.4,Y+.15,455+sgn*10.7),Vector3(.4,.22,.4),lamp,"airport",Color("fff3d6"))
 for i in range(5):
  _ap(Vector3(60-i*2.6,Y+.15,455),Vector3(.45,.24,.45),lamp,"airport",Color("fff3d6"))
 _ap(Vector3(222,Y+4.6,416.5),Vector3(54,9.2,13),wood,"airport",Color("d9d3c4"))
 _ap(Vector3(222,Y+9.5,416.5),Vector3(56,.55,14),dark,"airport",Color("4a5158"))
 for i in range(5):
  _ap(Vector3(200+i*11,Y+4.0,423.2),Vector3(8.6,3.2,.24),dark,"airport",Color("1c2229"))
 _collision_box(Vector3(222,Y+4.6,416.5),Vector3(54,9.2,13))
 _cylinder(Vector3(256,Y+7.0,421),1.25,14,metal,"airport",Color("b9bec3"))
 _ap(Vector3(256,Y+15.0,421),Vector3(4.2,2.4,4.2),dark,"airport",Color("222a31"))
 _ap(Vector3(256,Y+16.4,421),Vector3(2.4,.14,2.4),lamp,"airport",Color("fff3d6"))
 _cylinder(Vector3(256,Y+19.6,421),.07,5.2,metal,"airport",Color("8a9096"))
 _collision_box(Vector3(256,Y+8,421),Vector3(3,16,3))
 _aplane(Vector3(198,0,434),0.32);_aplane(Vector3(244,0,430),0.24)
 _cylinder(Vector3(200,Y+2.55,441),.08,5.1,metal,"airport",Color("7d8288"))
 _ap(Vector3(201.1,Y+4.85,441),Vector3(1.7,.38,.38),wood,"airport",Color("e07a2c"),0.35)
 for i in range(2):
  _batch(Vector3(250+i*9,Y+1.45,438),Basis(Vector3(0,0,1),-PI/2).scaled(Vector3(1.35,8.4,1.35)),_unit("cylinder"),metal,"airport",Color("9aa0a6"))
  _collision_box(Vector3(250+i*9,Y+1.45,438),Vector3(8.4,2.9,2.9))
func _island_scenery():
 if island.is_empty():return
 var foliage=_standard(0,.92);var wood=_standard(0,.88);var rock_mat=_standard(0,.95);var rice=_standard(0,.9);var thatch=_standard(0,.98)
 for palm in island.get("palms",[]):
  var x=float(palm[0]);var z=float(palm[1]);var s=float(palm[2]);var yaw=float(palm[3]);var y=height_at(x,z)
  var p=Vector3(x,y,z);var trunk_h=5.2*s
  _cylinder(p+Vector3(0,trunk_h*.5,0),.16*s,trunk_h,wood,"palm_trunk",Color("6a4b32"))
  for k in range(6):
   var ang=yaw+k*1.0472
   var at=p+Vector3(cos(ang)*1.15*s,trunk_h+0.15*s+sin(k*1.7)*0.22*s,sin(ang)*1.15*s)
   var basis=Basis.from_euler(Vector3(0.58,ang,0)).scaled(Vector3(2.6*s,.10*s,.62*s))
   _batch(at,basis,_unit("box"),foliage,"frond",Color("2f6d3f").lightened((k%3)*.045))
 for shrub in island.get("shrubs",[]):
  var p=Vector3(float(shrub[0]),height_at(float(shrub[0]),float(shrub[1])),float(shrub[1]));var s=float(shrub[2])
  _batch(p+Vector3(0,.45*s,0),Basis.IDENTITY.scaled(Vector3(1.15*s,.85*s,1.15*s)),_unit("sphere"),foliage,"shrub",Color("3f7a45"))
 for blade in island.get("grass",[]):
  var p=Vector3(float(blade[0]),height_at(float(blade[0]),float(blade[1])),float(blade[1]));var yaw=float(blade[2]);var tone=int(blade[3])
  _batch(p+Vector3(0,.32,0),Basis(Vector3.UP,yaw).scaled(Vector3(.11,.64,.11)),_unit("box"),foliage,"grass",Color("4f8a3f").lightened(tone*.05))
 for field in island.get("rice",[]):
  var cx=float(field.x);var cz=float(field.y);var levels=int(field.levels);var yaw=float(field.yaw)
  var base_y=height_at(cx,cz)
  for level in range(levels):
   var inset=level*.12;var w=float(field.w)*(1.0-inset);var h=float(field.h)*(1.0-inset)
   var pos=Vector3(cx,base_y+level*.38+.12,cz)
   _batch(pos,Basis(Vector3.UP,yaw).scaled(Vector3(w,.24,h)),_unit("box"),rice,"rice",Color("6c9b3f").lightened(level*.025))
 for warung in island.get("warungs",[]):
  var x=float(warung.x);var z=float(warung.y);var yaw=float(warung.yaw);var y=height_at(x,z);var p=Vector3(x,y,z);var tone=int(warung.tone)
  var wall=Color("c8a276").lightened(tone*.05)
  _batch(p+Vector3(0,1.35,0),Basis(Vector3.UP,yaw).scaled(Vector3(3.2,2.7,2.4)),_unit("box"),wood,"warung",wall)
  _collision_box(p+Vector3(0,1.35,0),Vector3(3.2,2.7,2.4),yaw)
  _batch(p+Vector3(0,2.95,0),Basis(Vector3.UP,yaw).scaled(Vector3(3.8,.18,3.0)),_unit("box"),thatch,"roof",Color("7d5032").lightened(tone*.04))
  _batch(p+Vector3(0,1.15,1.35),Basis(Vector3.UP,yaw).scaled(Vector3(3.0,.12,.55)),_unit("box"),wood,"counter",Color("8c623f"))
 for stone in island.get("rocks",[]):
  var x=float(stone[0]);var z=float(stone[1]);var s=float(stone[2]);var yaw=float(stone[3]);var y=height_at(x,z);var p=Vector3(x,y,z)
  _batch(p+Vector3(0,.45*s,0),Basis(Vector3.UP,yaw).scaled(Vector3(1.25*s,.9*s,1.15*s)),_unit("sphere"),rock_mat,"rock",Color("6d6a61").lightened(.04))
  if s>1.1:_collision_box(p+Vector3(0,.5*s,0),Vector3(1.6*s,1.2*s,1.5*s),yaw)
 for dock in island.get("docks",[]):
  var x=float(dock.x);var z=float(dock.y);var yaw=float(dock.yaw);var y=height_at(x,z);var p=Vector3(x,y,z)
  _batch(p+Vector3(0,.25,0),Basis(Vector3.UP,yaw).scaled(Vector3(5.2,.35,1.7)),_unit("box"),wood,"dock",Color("7b5838"))
  for side in [-1,1]:
   _cylinder(p+Vector3(side*1.8,0,0),.12,1.8,wood,"dock_post",Color("6a4b32"))
 for village in island.get("villages",[]):
  var x=float(village.x);var z=float(village.y);var yaw=float(village.yaw);var y=height_at(x,z);var p=Vector3(x,y,z)
  for k in range(3):
   var offset=Vector3(cos(yaw+k*2.1)*3.4,0,sin(yaw+k*2.1)*3.4)
   _batch(p+offset+Vector3(0,1.1,0),Basis(Vector3.UP,yaw+k).scaled(Vector3(2.4,2.2,2.0)),_unit("box"),wood,"hut",Color("b7895f").lightened(.02))
   _batch(p+offset+Vector3(0,2.55,0),Basis(Vector3.UP,yaw+k).scaled(Vector3(2.9,.22,2.6)),_unit("box"),thatch,"roof",Color("77502f"))
func _setup_environment():
 environment=WorldEnvironment.new();var e=Environment.new()
 var sky=Sky.new();sky.radiance_size=Sky.RADIANCE_SIZE_128
 var sm=ShaderMaterial.new();sm.shader=load("res://assets/shaders/sky.gdshader")
 var sun_basis=Basis.from_euler(Vector3(deg_to_rad(-54),deg_to_rad(-38),0))
 sm.set_shader_parameter("sun_dir",sun_basis*Vector3(0,-1,0))
 sky.sky_material=sm;e.sky=sky
 e.background_mode=Environment.BG_SKY
 e.ambient_light_source=Environment.AMBIENT_SOURCE_SKY;e.ambient_light_energy=1.85
 e.reflected_light_source=Environment.REFLECTION_SOURCE_SKY
 e.tonemap_mode=Environment.TONE_MAPPER_ACES;e.tonemap_exposure=1.2;e.tonemap_white=7.0
 e.adjustment_enabled=true;e.adjustment_saturation=1.08;e.adjustment_contrast=1.02;e.adjustment_brightness=1.03
 e.fog_enabled=quality>0;e.fog_light_color=Color("e4d9c6");e.fog_density=.0011;e.fog_sky_affect=.16
 if quality>=1:
  e.ssao_enabled=true;e.ssao_radius=1.1;e.ssao_intensity=1.05;e.ssao_power=1.15;e.ssao_detail=.3
  e.glow_enabled=true;e.glow_intensity=.28;e.glow_strength=.7;e.glow_bloom=.04;e.glow_hdr_threshold=1.05;e.glow_blend_mode=Environment.GLOW_BLEND_MODE_ADDITIVE
  e.volumetric_fog_enabled=false
 environment.environment=e;add_child(environment)
 sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-54,-38,0);sun.light_color=Color("fff1da");sun.light_energy=1.55;sun.light_angular_distance=.8;sun.shadow_enabled=quality>0
 sun.directional_shadow_max_distance=70 if quality==1 else 120;sun.directional_shadow_split_1=.06;sun.directional_shadow_split_2=.18;sun.shadow_bias=.12;sun.shadow_blur=1.6;sun.directional_shadow_pancake_size=4.0
 add_child(sun)
 var fill=DirectionalLight3D.new();fill.rotation_degrees=Vector3(38,142,0);fill.light_color=Color("c8d6e8");fill.light_energy=.52;fill.light_angular_distance=1.2;fill.shadow_enabled=false;add_child(fill)
func _standard(metal=0.0,rough=.8,emission=Color.BLACK):
 var key=str(metal)+":"+str(rough)+":"+emission.to_html()
 if material_cache.has(key):return material_cache[key]
 var m=StandardMaterial3D.new();m.albedo_color=Color.WHITE;m.vertex_color_use_as_albedo=true;m.vertex_color_is_srgb=false;m.metallic=metal;m.roughness=rough;m.emission_enabled=emission!=Color.BLACK;m.emission=emission;material_cache[key]=m;return m
func _unit(kind):
 if mesh_cache.has(kind):return mesh_cache[kind]
 var mesh
 if kind=="box":mesh=BoxMesh.new();mesh.size=Vector3.ONE
 elif kind=="cylinder":mesh=CylinderMesh.new();mesh.top_radius=1;mesh.bottom_radius=1;mesh.height=1;mesh.radial_segments=8
 else:mesh=SphereMesh.new();mesh.radius=1;mesh.height=2;mesh.radial_segments=8;mesh.rings=4
 mesh_cache[kind]=mesh;return mesh
func _box(pos,size,material,kind,color,yaw=0.0):_batch(pos,Basis(Vector3.UP,yaw).scaled(size),_unit("box"),material,kind,color)
func _cylinder(pos,radius,height,material,kind,color):_batch(pos,Basis.IDENTITY.scaled(Vector3(radius,height,radius)),_unit("cylinder"),material,kind,color)
func _collision_box(pos,size,yaw=0.0):
 var key=str(floori(pos.x/CHUNK))+":"+str(floori(pos.z/CHUNK))
 if not collision_chunks.has(key):
  var body=StaticBody3D.new();body.collision_layer=1;body.position=Vector3(floorf(pos.x/CHUNK)*CHUNK+CHUNK/2,0,floorf(pos.z/CHUNK)*CHUNK+CHUNK/2);add_child(body);collision_chunks[key]=body;solids.append(body)
 var body=collision_chunks[key];var shape=BoxShape3D.new();shape.size=size;var c=CollisionShape3D.new();c.shape=shape;c.position=pos-body.position;c.rotation.y=yaw;body.add_child(c);collision_shape_count+=1
func _tree(t,trunk,leaves):
 var p=Vector3(t.x/10.0,0,t.y/10.0);var r=float(t.r)/10;var height=r*2.2
 _cylinder(p+Vector3(0,height/2,0),r*.18,height,trunk,"trunks",Color("594737"));_collision_box(p+Vector3(0,height/2,0),Vector3(r*.36,height,r*.36))
 var base=Color(t.tone)
 for k in range(3 if quality==0 else 7):
  var angle=k*2.39;var layer=k%3
  var at=p+Vector3(cos(angle)*r*.52,height+r*.62+layer*r*.3,sin(angle)*r*.52)
  var tone=base.darkened(.10-layer*.06).lightened((k%2)*.04)
  _batch(at,Basis.IDENTITY.scaled(Vector3(r*.86,r*.72,r*.86)),_unit("sphere"),leaves,"leaves",tone)
 # underside shade ball for canopy depth
 _batch(p+Vector3(0,height+r*.72,0),Basis.IDENTITY.scaled(Vector3(r*.66,r*.5,r*.66)),_unit("sphere"),leaves,"leaves",base.darkened(.22))
func _batch(pos,basis,mesh,material,kind,color):
 var key=kind+"/"+str(material.get_instance_id())+"/"+str(floori(pos.x/CHUNK))+":"+str(floori(pos.z/CHUNK))
 if not batches.has(key):batches[key]={"mesh":mesh,"material":material,"items":[],"colors":[],"kind":kind,"origin":Vector3(floorf(pos.x/CHUNK)*CHUNK+CHUNK/2,0,floorf(pos.z/CHUNK)*CHUNK+CHUNK/2)}
 batches[key].items.append(Transform3D(basis,pos-batches[key].origin));batches[key].colors.append(color.srgb_to_linear());instance_count+=1
func _commit(entry):
 var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true;mm.mesh=entry.mesh;mm.instance_count=entry.items.size()
 for i in range(entry.items.size()):mm.set_instance_transform(i,entry.items[i]);mm.set_instance_color(i,entry.colors[i])
 var node=MultiMeshInstance3D.new();node.multimesh=mm;node.material_override=entry.material;node.position=entry.origin;node.visibility_range_end=distance_limit;node.visibility_range_end_margin=10;node.set_meta("kind",entry.kind);node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if quality==0 or entry.kind in ["leaves","lamps","red","green","water","frond","grass","rice","shrub"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON;add_child(node);batch_nodes.append(node)
func set_quality(tier):
 quality=tier;distance_limit=[65.0,100.0,150.0][tier]
 if sun:sun.shadow_enabled=tier>0;sun.directional_shadow_max_distance=45 if tier==1 else 75
 for node in batch_nodes:node.visibility_range_end=distance_limit;node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if tier==0 or node.get_meta("kind") in ["leaves","lamps","red","green","water","frond","grass","rice","shrub"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
 if environment:environment.environment.fog_density=[.0010,.0007,.0005][tier];environment.environment.fog_sky_affect=.12
func nearest_poi(point):
 var best=null;var distance=INF
 for p in data.map.pois:
  var d=Vector2(point.x-p.x/10.0,point.z-p.y/10.0).length()
  if d<distance:distance=d;best=p
 return best
