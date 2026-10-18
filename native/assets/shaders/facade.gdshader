shader_type spatial;
varying vec3 world_pos;
varying vec3 world_normal;
void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 world_normal=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);
}
float rect(vec2 uv,vec2 lo,vec2 hi,vec2 aa){
 vec2 a=smoothstep(lo-aa,lo+aa,uv);
 vec2 b=1.0-smoothstep(hi-aa,hi+aa,uv);
 return a.x*a.y*b.x*b.y;
}
void fragment(){
 bool roof=abs(world_normal.y)>0.7;
 vec3 base=COLOR.rgb;
 if(roof){ALBEDO=base*0.58;ROUGHNESS=0.94;}
 else{
  vec2 uv=(abs(world_normal.x)>0.7?world_pos.zy:world_pos.xy)/vec2(2.7,3.0);
  vec2 aa=max(fwidth(uv),vec2(0.002));
  vec2 tile=fract(uv);
  float detail=1.0-smoothstep(55.0,85.0,distance(CAMERA_POSITION_WORLD,world_pos));
  float frame=rect(tile,vec2(0.25,0.12),vec2(0.77,0.71),aa)*step(2.8,world_pos.y)*detail;
  float glass=rect(tile,vec2(0.29,0.16),vec2(0.73,0.67),aa)*step(2.8,world_pos.y)*detail;
  ALBEDO=mix(base,base*0.53,frame);
  ALBEDO=mix(ALBEDO,vec3(0.12,0.22,0.29),glass);
  ROUGHNESS=mix(0.92,0.22,glass);
  METALLIC=glass*0.48;
 }
}
