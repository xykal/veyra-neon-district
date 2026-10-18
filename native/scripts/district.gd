extends Node3D
# One terrain surface + instanced facades. No stacked road planes or coplanar window boxes.
var data={}
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
 _terrain();_progress(progress,.08,"Menyiapkan permukaan jalan")
 if incremental:await get_tree().process_frame
 var facade=ShaderMaterial.new();facade.shader=load("res://assets/shaders/facade.gdshader")
 var total=m.buildings.size()
 for i in range(total):
  var b=m.buildings[i];var h=maxf(1.4,float(b.height)*.8);var pos=Vector3((b.x+b.w/2)/10,h/2,(b.y+b.h/2)/10);var size=Vector3(b.w/10.0,h,b.h/10.0)
  _box(pos,size,facade,"facade",Color(b.color).lightened(.045));_collision_box(pos,size)
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.08+.34*float(i)/total,"Menyiapkan blok kota");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 var trunk=_standard(0,.95);var leaves=_standard(0,.95)
 for i in range(m.trees.size()):
  _tree(m.trees[i],trunk,leaves)
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.47,"Menyiapkan vegetasi");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 var metal=_standard(.55,.55);var wood=_standard(0,.86);var lamp=_standard(0,.25,Color("c5b06d")*.45)
 for i in range(m.props.size()):
  var p=m.props[i];var pos=Vector3(float(p.x)/10,0,float(p.y)/10)
  if p.type=="light":
   _cylinder(pos+Vector3(0,2.2,0),.07,4.4,metal,"pole",Color("414d51"));_collision_box(pos+Vector3(0,2.2,0),Vector3(.18,4.4,.18))
   _box(pos+Vector3(.3,4.4,0),Vector3(.7,.1,.18),metal,"metal",Color("414d51"));_box(pos+Vector3(.55,4.36,0),Vector3(.3,.04,.17),lamp,"lamps",Color("e5dcae"))
  elif p.type=="bench":
   _box(pos+Vector3(0,.46,0),Vector3(2,.11,.6),wood,"wood",Color("70513a"),-float(p.get("a",0)));_collision_box(pos+Vector3(0,.4,0),Vector3(2,.8,.6),-float(p.get("a",0)))
   for x in [-.75,.75]:_box(pos+Vector3(x,.22,0),Vector3(.09,.44,.4),metal,"metal",Color("414d51"))
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.57,"Menyiapkan objek jalan");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
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
 _progress(progress,.7,"Menggabungkan render kota")
 var entries=batches.values()
 for i in range(entries.size()):
  _commit(entries[i])
  if incremental and Time.get_ticks_usec()-slice_started>4500:_progress(progress,.7+.25*float(i)/entries.size(),"Mengunggah batch grafis");await get_tree().process_frame;slice_started=Time.get_ticks_usec()
 batches.clear();built=true;building=false;generation_seconds=(Time.get_ticks_msec()-started)/1000.0;_progress(progress,1.0,"Kota siap")
func _terrain():
 var geometry=MeshInstance3D.new();geometry.name="TerrainSingleSurface";geometry.set_meta("terrain_surface",true);var plane=PlaneMesh.new();plane.size=Vector2(world_size+80,world_size+80);geometry.mesh=plane;geometry.position=Vector3(world_size/2,0,world_size/2)
 var mat=ShaderMaterial.new();mat.shader=load("res://assets/shaders/terrain.gdshader")
 var image=Image.create_empty(64,64,false,Image.FORMAT_RGB8);var rng=RandomNumberGenerator.new();rng.seed=192040
 for y in range(64):
  for x in range(64):
   var n=rng.randf();image.set_pixel(x,y,Color(n,n,n))
 image.generate_mipmaps();mat.set_shader_parameter("grain_tex",ImageTexture.create_from_image(image));geometry.material_override=mat;geometry.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;add_child(geometry)
 _collision_box(Vector3(world_size/2,-.15,world_size/2),Vector3(world_size+80,.3,world_size+80))
func _setup_environment():
 environment=WorldEnvironment.new();var e=Environment.new();var sky=Sky.new();var sm=ProceduralSkyMaterial.new();sm.sky_top_color=Color("365a84");sm.sky_horizon_color=Color("aebdc5");sm.ground_bottom_color=Color("27323a");sm.ground_horizon_color=Color("a1adae");sky.sky_material=sm;e.sky=sky;e.background_mode=Environment.BG_SKY;e.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;e.ambient_light_color=Color("b4c4d2");e.ambient_light_energy=.55;e.tonemap_mode=Environment.TONE_MAPPER_FILMIC;e.fog_enabled=true;e.fog_light_color=Color("99adb7");e.fog_density=.003;e.fog_sky_affect=.35;environment.environment=e;add_child(environment)
 sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-42,-28,0);sun.light_color=Color("ffe6c7");sun.light_energy=1.5;sun.shadow_enabled=quality>0;sun.directional_shadow_max_distance=45 if quality==1 else 75;add_child(sun)
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
 for k in range(3 if quality==0 else 6):
  var angle=k*2.39;var at=p+Vector3(cos(angle)*r*.5,height+r*.55+(k%3)*r*.28,sin(angle)*r*.5)
  _batch(at,Basis.IDENTITY.scaled(Vector3(r*.7,r*.8,r*.7)),_unit("sphere"),leaves,"leaves",Color(t.tone).lightened(.1+(k%3)*.025))
func _batch(pos,basis,mesh,material,kind,color):
 var key=kind+"/"+str(material.get_instance_id())+"/"+str(floori(pos.x/CHUNK))+":"+str(floori(pos.z/CHUNK))
 if not batches.has(key):batches[key]={"mesh":mesh,"material":material,"items":[],"colors":[],"kind":kind,"origin":Vector3(floorf(pos.x/CHUNK)*CHUNK+CHUNK/2,0,floorf(pos.z/CHUNK)*CHUNK+CHUNK/2)}
 batches[key].items.append(Transform3D(basis,pos-batches[key].origin));batches[key].colors.append(color.srgb_to_linear());instance_count+=1
func _commit(entry):
 var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_colors=true;mm.mesh=entry.mesh;mm.instance_count=entry.items.size()
 for i in range(entry.items.size()):mm.set_instance_transform(i,entry.items[i]);mm.set_instance_color(i,entry.colors[i])
 var node=MultiMeshInstance3D.new();node.multimesh=mm;node.material_override=entry.material;node.position=entry.origin;node.visibility_range_end=distance_limit;node.visibility_range_end_margin=10;node.set_meta("kind",entry.kind);node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if quality==0 or entry.kind in ["leaves","lamps","red","green","water"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON;add_child(node);batch_nodes.append(node)
func set_quality(tier):
 quality=tier;distance_limit=[65.0,100.0,150.0][tier]
 if sun:sun.shadow_enabled=tier>0;sun.directional_shadow_max_distance=45 if tier==1 else 75
 for node in batch_nodes:node.visibility_range_end=distance_limit;node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if tier==0 or node.get_meta("kind") in ["leaves","lamps","red","green","water"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
 if environment:environment.environment.fog_density=[.006,.0035,.002][tier]
func nearest_poi(point):
 var best=null;var distance=INF
 for p in data.map.pois:
  var d=Vector2(point.x-p.x/10.0,point.z-p.y/10.0).length()
  if d<distance:distance=d;best=p
 return best
