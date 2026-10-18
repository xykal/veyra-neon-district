extends Node3D

var data={}
var batches={}
var batch_nodes=[]
var solids=[]
var quality=0
var distance_limit=70.0
var environment:WorldEnvironment
var sun:DirectionalLight3D
var world_size=480.0
var generation_seconds=0.0
var material_cache={}
var daylight=.8
func build(tier=0):
 var started=Time.get_ticks_msec();quality=tier;distance_limit=[70.0,115.0,180.0][tier]
 data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/district.json"))
 var m=data.map;world_size=float(m.size)/10.0
 _setup_environment()
 var ground=_mat("202a27",0,.97);_add_box(Vector3(world_size/2,-.15,world_size/2),Vector3(world_size+80,.3,world_size+80),ground,true,"ground")
 var road=_surface_shader(Color("30353a"),.075);var pavement=_surface_shader(Color("7c827f"),.05)
 for r in m.roads:_add_box(Vector3((r.x+r.w/2)/10,-.005,(r.y+r.h/2)/10),Vector3(r.w/10.0,.035,r.h/10.0),road,false,"road")
 for r in m.sidewalks:_add_box(Vector3((r.x+r.w/2)/10,.015,(r.y+r.h/2)/10),Vector3(r.w/10.0,.03,r.h/10.0),pavement,false,"sidewalk")
 var white=_mat("d3d4c8",0,.85)
 for line in range(9):
  var at=line*60.0
  for along in range(0,480,7):
   _add_box(Vector3(at,.023,along+1.5),Vector3(.11,.012,3.0),white,false,"paint")
   _add_box(Vector3(along+1.5,.024,at),Vector3(3.0,.012,.11),white,false,"paint")
 for b in m.buildings:
  var h=maxf(1.4,float(b.height)*.8);var pos=Vector3((b.x+b.w/2)/10,h/2,(b.y+b.h/2)/10);var size=Vector3(b.w/10.0,h,b.h/10.0)
  var facade=_surface_shader(Color(b.color).lightened(.07),.08)
  _add_box(pos,size,facade,true,"building")
  _add_box(pos+Vector3(0,h/2+.06,0),Vector3(size.x+.12,.13,size.z+.12),_mat(b.roof,0,.93),false,"roof")
  _windows(pos,size,h)
 for t in m.trees:_tree(t)
 var metal=_mat("414d51",.7,.4)
 for p in m.props:
  var pos=Vector3(float(p.x)/10,0,float(p.y)/10)
  if p.type=="light":
   _add_cylinder(pos+Vector3(0,2.2,0),.07,4.4,metal,"lamp")
   _collision_box(pos+Vector3(0,2.2,0),Vector3(.18,4.4,.18))
   _add_box(pos+Vector3(.3,4.4,0),Vector3(.7,.1,.18),metal,false,"lamp")
   _add_box(pos+Vector3(.55,4.36,0),Vector3(.3,.04,.17),_mat("e5dcae",0,.2,Color("e5c987")*.8),false,"lamp-emission")
  elif p.type=="bench":
   _add_box(pos+Vector3(0,.46,0),Vector3(2.0,.11,.6),_mat("70513a",0,.8),true,"bench",-float(p.get("a",0)))
   for x in [-.75,.75]:_add_box(pos+Vector3(x,.22,0),Vector3(.09,.44,.4),metal,false,"bench-leg")
 for i in range(9):
  for j in range(9):
   for s in [-1,1]:
    var pos=Vector3(i*60+s*6.0,0,j*60+s*6.0)
    _add_cylinder(pos+Vector3(0,2.2,0),.065,4.4,metal,"signal")
    _collision_box(pos+Vector3(0,2.3,0),Vector3(.2,4.6,.2))
    _add_box(pos+Vector3(0,4.4,0),Vector3(.35,1,.25),_mat("141b21",.2,.5),false,"signal-box")
    _add_box(pos+Vector3(0,4.65,.14),Vector3(.18,.16,.03),_mat("c94135",0,.3,Color("b33226")),false,"signal-red")
    _add_box(pos+Vector3(0,4.15,.14),Vector3(.18,.16,.03),_mat("37a875",0,.3,Color("258559")),false,"signal-green")
 for w in m.water:
  var pos=Vector3((w.x+w.w/2)/10,-.03,(w.y+w.h/2)/10);var size=Vector3(w.w/10.0,.03,w.h/10.0)
  _add_box(pos,size,_mat("236176",.35,.18),false,"water")
  for edge in [-1,1]:
   _add_box(pos+Vector3(edge*size.x/2,.6,0),Vector3(.08,1.2,size.z),metal,true,"water-fence")
   _add_box(pos+Vector3(0,.6,edge*size.z/2),Vector3(size.x,1.2,.08),metal,true,"water-fence")
 _commit_batches();generation_seconds=(Time.get_ticks_msec()-started)/1000.0
func _setup_environment():
 environment=WorldEnvironment.new();var e=Environment.new();var sky=Sky.new();var sm=ProceduralSkyMaterial.new();sm.sky_top_color=Color("365a84");sm.sky_horizon_color=Color("b7c2c6");sm.ground_bottom_color=Color("27323a");sm.ground_horizon_color=Color("a1adae");sky.sky_material=sm;e.sky=sky;e.background_mode=Environment.BG_SKY;e.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;e.ambient_light_color=Color("b4c4d2");e.ambient_light_energy=.55;e.tonemap_mode=Environment.TONE_MAPPER_FILMIC;e.fog_enabled=true;e.fog_light_color=Color("99adb7");e.fog_density=.0018;e.fog_sky_affect=.35;environment.environment=e;add_child(environment)
 sun=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-42,-28,0);sun.light_color=Color("ffe6c7");sun.light_energy=1.5;sun.shadow_enabled=quality>0;sun.directional_shadow_max_distance=65 if quality==1 else 110;add_child(sun)
func _mat(color,metallic=0.0,roughness=.8,emission=Color.BLACK):
 var c=Color(color);var key=c.to_html()+str(metallic)+str(roughness)+emission.to_html()
 if material_cache.has(key):return material_cache[key]
 var m=StandardMaterial3D.new();m.albedo_color=c;m.metallic=metallic;m.roughness=roughness;m.emission_enabled=emission!=Color.BLACK;m.emission=emission;material_cache[key]=m;return m
func _surface_shader(color,grain):
 var key="surface"+color.to_html()+str(grain)
 if material_cache.has(key):return material_cache[key]
 var s=Shader.new();s.code="shader_type spatial; varying vec3 world_pos; uniform vec4 base_color:source_color; uniform float grain=0.1; void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;} float n(vec3 p){return fract(sin(dot(floor(p*32.0),vec3(12.9898,78.233,45.164)))*43758.5453);} void fragment(){float noise=n(world_pos);ALBEDO=base_color.rgb*(0.9+noise*grain);ROUGHNESS=0.9;}"
 var m=ShaderMaterial.new();m.shader=s;m.set_shader_parameter("base_color",color);m.set_shader_parameter("grain",grain);material_cache[key]=m;return m
func _add_box(pos,size,material,collision=false,kind="box",yaw=0.0):
 var mesh=BoxMesh.new();mesh.size=Vector3.ONE;_batch(pos,Basis(Vector3.UP,yaw).scaled(size),mesh,material,kind)
 if collision:_collision_box(pos,size,yaw)
func _collision_box(pos,size,yaw=0.0):
 var b=StaticBody3D.new();b.collision_layer=1;var shape=BoxShape3D.new();shape.size=size;var c=CollisionShape3D.new();c.shape=shape;b.add_child(c);add_child(b);b.position=pos;b.rotation.y=yaw;solids.append(b)
func _add_cylinder(pos,radius,height,material,kind):
 var mesh=CylinderMesh.new();mesh.top_radius=1;mesh.bottom_radius=1;mesh.height=1;mesh.radial_segments=8;_batch(pos,Basis.IDENTITY.scaled(Vector3(radius,height,radius)),mesh,material,kind)
func _tree(t):
 var p=Vector3(t.x/10.0,0,t.y/10.0);var r=float(t.r)/10.0;var height=r*2.2
 _add_cylinder(p+Vector3(0,height/2,0),r*.18,height,_mat("594737",0,.93),"trunk")
 _collision_box(p+Vector3(0,height/2,0),Vector3(r*.36,height,r*.36))
 var sphere=SphereMesh.new();sphere.radius=1;sphere.height=2;sphere.radial_segments=8;sphere.rings=4
 var color=Color(t.tone).lightened(.1)
 for k in range(4 if quality==0 else 7):
  var a=k*2.39;var at=p+Vector3(cos(a)*r*.5,height+r*.55+(k%3)*r*.28,sin(a)*r*.5)
  _batch(at,Basis.IDENTITY.scaled(Vector3(r*.65,r*.75,r*.65)),sphere,_mat(color.lightened((k%3)*.035),0,.95),"leaves")
func _windows(pos,size,height):
 var glass=_mat("7b98a3",.55,.17)
 var rows=mini(12,int(height/3));var density=2 if quality==0 else 1
 for side in [-1,1]:
  for row in range(1,rows,density):
   for col in range(1,maxi(2,int(size.x/2.7)),density):
    var x=-size.x/2+col*2.7
    if x>size.x/2-.6:continue
    _add_box(Vector3(pos.x+x,row*3.0,pos.z+side*(size.z/2+.015)),Vector3(1.1,1.35,.035),glass,false,"window")
   for col in range(1,maxi(2,int(size.z/2.7)),density):
    var z=-size.z/2+col*2.7
    if z>size.z/2-.6:continue
    _add_box(Vector3(pos.x+side*(size.x/2+.015),row*3.0,pos.z+z),Vector3(.035,1.35,1.1),glass,false,"window")
func _batch(pos,basis,mesh,material,kind):
 var key=kind+"/"+str(material.get_instance_id())+"/"+str(int(pos.x/60))+":"+str(int(pos.z/60))
 if not batches.has(key):batches[key]={"mesh":mesh,"material":material,"items":[],"kind":kind,"origin":Vector3(floorf(pos.x/60)*60+30,0,floorf(pos.z/60)*60+30)}
 batches[key].items.append(Transform3D(basis,pos-batches[key].origin))
func _commit_batches():
 for entry in batches.values():
  var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.mesh=entry.mesh;mm.instance_count=entry.items.size()
  for i in range(entry.items.size()):mm.set_instance_transform(i,entry.items[i])
  var node=MultiMeshInstance3D.new();node.multimesh=mm;node.material_override=entry.material;node.position=entry.origin;node.visibility_range_end=0 if entry.kind in ["ground","road","paint","water"] else distance_limit+45;node.set_meta("kind",entry.kind);node.visibility_range_end_margin=20;node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if entry.kind in ["paint","road","window","leaves"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON;add_child(node);batch_nodes.append(node)
 batches.clear()
func set_quality(tier):
 quality=tier;distance_limit=[70.0,115.0,180.0][tier]
 if sun:sun.shadow_enabled=tier>0
 for node in batch_nodes:
  if node.get_meta("kind") not in ["ground","road","paint","water"]:node.visibility_range_end=distance_limit+45
 if environment:environment.environment.fog_density=[.005,.0028,.0018][tier]
func nearest_poi(point):
 var best=null;var distance=INF
 for p in data.map.pois:
  var d=Vector2(point.x-p.x/10.0,point.z-p.y/10.0).length()
  if d<distance:distance=d;best=p
 return best
