shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
varying vec3 world_pos;
uniform sampler2D grain_tex : filter_linear_mipmap, repeat_enable;
void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
 vec2 p=world_pos.xz;
 vec2 cell=abs(mod(p+vec2(30.0),vec2(60.0))-vec2(30.0));
 vec2 aa=max(fwidth(p),vec2(0.008));
 float road_x=1.0-smoothstep(4.8-aa.x,4.8+aa.x,cell.x);
 float road_z=1.0-smoothstep(4.8-aa.y,4.8+aa.y,cell.y);
 float road=max(road_x,road_z);
 float pavement=max(1.0-smoothstep(7.0-aa.x,7.0+aa.x,cell.x),1.0-smoothstep(7.0-aa.y,7.0+aa.y,cell.y));
 vec3 color=mix(vec3(0.035,0.055,0.043),vec3(0.20,0.22,0.21),pavement);
 color=mix(color,vec3(0.036,0.043,0.050),road);
 float dash_x=(1.0-smoothstep(0.055-aa.x,0.055+aa.x,cell.x))*step(4.95,cell.y)*(1.0-smoothstep(2.9,3.1,mod(p.y,7.0)));
 float dash_z=(1.0-smoothstep(0.055-aa.y,0.055+aa.y,cell.y))*step(4.95,cell.x)*(1.0-smoothstep(2.9,3.1,mod(p.x,7.0)));
 float marking=max(dash_x,dash_z)*road;
 color=mix(color,vec3(0.62,0.63,0.54),marking);
 // A filtered mipmapped texture replaces the old unfiltered sin/floor fragment noise.
 float grain=texture(grain_tex,p*0.5).r-0.5;
 ALBEDO=color*(1.0+grain*0.045);
 ROUGHNESS=mix(0.98,0.91,road);
}
