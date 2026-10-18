extends Node3D
var traces=[]
var sparks=[]
func trace_shot(from,to):
 var line=MeshInstance3D.new();var mesh=ImmediateMesh.new();var m=StandardMaterial3D.new();m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;m.albedo_color=Color(1,.8,.35);mesh.surface_begin(Mesh.PRIMITIVE_LINES,m);mesh.surface_add_vertex(from);mesh.surface_add_vertex(to);mesh.surface_end();line.mesh=mesh;add_child(line);traces.append({"node":line,"time":.08})
func impact(point,normal,kind="metal"):
 for i in range(5):
  var node=MeshInstance3D.new();var mesh=SphereMesh.new();mesh.radius=.015;mesh.height=.03;mesh.radial_segments=4;mesh.rings=2;node.mesh=mesh;var m=StandardMaterial3D.new();m.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;m.albedo_color=Color("ffc67e") if kind=="metal" else Color("a69b84");node.material_override=m;add_child(node);node.global_position=point;sparks.append({"node":node,"time":.25,"velocity":normal*randf_range(1,2)+Vector3(randf_range(-1,1),randf_range(0,1),randf_range(-1,1))})
func _process(delta):
 for i in range(traces.size()-1,-1,-1):
  traces[i].time-=delta
  if traces[i].time<=0:traces[i].node.queue_free();traces.remove_at(i)
 for i in range(sparks.size()-1,-1,-1):
  var s=sparks[i];s.time-=delta;s.velocity.y-=9.81*delta;s.node.position+=s.velocity*delta
  if s.time<=0:s.node.queue_free();sparks.remove_at(i)
