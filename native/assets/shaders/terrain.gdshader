shader_type spatial;
render_mode unshaded, cull_disabled;
varying vec3 world_pos;
varying vec3 world_normal;
uniform sampler2D grain_tex : filter_linear_mipmap, repeat_enable;
uniform float flat_radius = 205.0;
uniform vec2 world_center = vec2(240.0, 240.0);
void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 world_normal=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);
}
void fragment(){
 vec2 p=world_pos.xz;
 float dist_to_center=distance(p,world_center);
 float slope=1.0-clamp(world_normal.y,0.0,1.0);
 float height=world_pos.y;
 vec2 cell=abs(mod(p+vec2(30.0),vec2(60.0))-vec2(30.0));
 vec2 aa=max(fwidth(p),vec2(0.008));
 float road_x=1.0-smoothstep(4.8-aa.x,4.8+aa.x,cell.x);
 float road_z=1.0-smoothstep(4.8-aa.y,4.8+aa.y,cell.y);
 float city_mask=1.0-smoothstep(flat_radius-8.0,flat_radius+12.0,dist_to_center);
 float road=max(road_x,road_z)*city_mask;
 float pavement=max(1.0-smoothstep(7.0-aa.x,7.0+aa.x,cell.x),1.0-smoothstep(7.0-aa.y,7.0+aa.y,cell.y))*city_mask;
 float sand=smoothstep(1.2,0.05,height)*smoothstep(0.62,0.18,world_normal.y+0.32);
 float beach=sand*(1.0-city_mask*0.75);
 float grass_band=smoothstep(0.25,1.4,height)*(1.0-smoothstep(7.5,14.0,height));
 float rock=clamp(smoothstep(0.22,0.58,slope)+smoothstep(11.0,19.0,height),0.0,1.0);
 vec3 grass=mix(vec3(0.16,0.32,0.12),vec3(0.30,0.46,0.16),clamp(height*0.045,0.0,1.0));
 vec3 dirt=vec3(0.36,0.27,0.16);
 vec3 mountain=mix(grass,dirt,grass_band*0.35);
 mountain=mix(mountain,vec3(0.32,0.33,0.30),rock);
 mountain=mix(mountain,vec3(0.72,0.62,0.42),beach);
 vec3 color=mix(mountain,vec3(0.42,0.45,0.43),pavement);
 color=mix(color,vec3(0.16,0.18,0.21),road);
 float dash_x=(1.0-smoothstep(0.055-aa.x,0.055+aa.x,cell.x))*step(4.95,cell.y)*(1.0-smoothstep(2.9,3.1,mod(p.y,7.0)));
 float dash_z=(1.0-smoothstep(0.055-aa.y,0.055+aa.y,cell.y))*step(4.95,cell.x)*(1.0-smoothstep(2.9,3.1,mod(p.x,7.0)));
 float marking=max(dash_x,dash_z)*road;
 color=mix(color,vec3(0.78,0.78,0.68),marking);
 float grain=texture(grain_tex,p*0.5).r-0.5;
 ALBEDO=color*(1.0+grain*0.05);
 ROUGHNESS=mix(0.98,0.91,road);
}
