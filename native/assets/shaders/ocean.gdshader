shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
varying vec3 world_pos;
uniform float time_hint = 0.0;
void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 float wave=sin(world_pos.x*0.08+time_hint*1.2)*0.025+cos(world_pos.z*0.11-time_hint*0.8)*0.018;
 VERTEX.y+=wave;
}
void fragment(){
 float sparkle=pow(clamp(0.5+0.5*sin(world_pos.x*0.32+TIME*1.1)+0.25*sin(world_pos.z*0.41-TIME*0.7),0.0,1.0),5.0);
 ALBEDO=mix(vec3(0.02,0.16,0.22),vec3(0.07,0.34,0.38),sparkle*0.6);
 ROUGHNESS=mix(0.18,0.055,sparkle);
 METALLIC=0.12;
}
