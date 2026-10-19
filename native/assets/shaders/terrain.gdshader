shader_type spatial;
render_mode cull_disabled,depth_draw_opaque;
// Veyra terrain v2: PBR texture splat by height/slope + city mask, lit with sun+fog.
uniform sampler2D grass_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D grass_r : filter_linear_mipmap, repeat_enable;
uniform sampler2D rock_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D rock_r : filter_linear_mipmap, repeat_enable;
uniform sampler2D sand_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D sand_r : filter_linear_mipmap, repeat_enable;
uniform sampler2D asphalt_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D asphalt_r : filter_linear_mipmap, repeat_enable;
uniform sampler2D concrete_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D map_tex : filter_linear_mipmap, repeat_disable;
uniform float world_size = 480.0;
uniform float flat_radius = 250.0;
uniform float detail_far = 120.0;

varying vec3 world_pos;
varying vec3 world_normal;

float hash21(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
float noise(vec2 p){
 vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
 return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),u.y);
}

void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 world_normal=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);
}

void fragment(){
 float height=world_pos.y;
 vec2 p=world_pos.xz;
 vec2 dc=abs(world_pos.xz-vec2(world_size*.5))-vec2(world_size*.5);
 float rect_d=length(max(dc,vec2(0.0)))+min(max(dc.x,dc.y),0.0);
 float city_mask=1.0-smoothstep(0.0,26.0,rect_d);
 float dcam=length(world_pos-CAMERA_POSITION_WORLD);
 float detail=1.0-smoothstep(detail_far*.55,detail_far,dcam);
 vec2 muv=clamp(p/world_size,vec2(0.002),vec2(0.998));
 vec4 mask=texture(map_tex,muv);

 // --- city materials (asphalt / concrete / dirt lot / park grass) ---
 vec2 uv_a=p*0.14; vec2 uv_c=p*0.085;
 vec3 asphalt=texture(asphalt_c,uv_a).rgb;
 float asphalt_rgh=texture(asphalt_r,uv_a).r;
 vec3 pavement=texture(concrete_c,uv_c).rgb;
 vec3 lot_dirt=texture(sand_c,p*0.11).rgb;
 vec3 park=texture(grass_c,p*0.16).rgb;

 float gx=min(fract(p.x/60.0),1.0-fract(p.x/60.0))*60.0;
 float gz=min(fract(p.y/60.0),1.0-fract(p.y/60.0))*60.0;
 float on_v=step(gx,0.065);
 float on_h=step(gz,0.065);
 float seg_v=step(fract(p.y/8.0),0.36);
 float seg_h=step(fract(p.x/8.0),0.36);
 float road_core=smoothstep(0.72,0.92,mask.r);
 float crossing=on_v*on_h;
 float dash=max(on_v*seg_v*(1.0-on_h),on_h*seg_h*(1.0-on_v))*(1.0-crossing)*road_core*city_mask*(0.4+0.6*detail);

 vec3 city_ground=pavement;
 city_ground=mix(city_ground,lot_dirt,mask.a);
 city_ground=mix(city_ground,park,mask.g);
 city_ground=mix(city_ground,asphalt,mask.r);
 city_ground=mix(city_ground,vec3(0.86,0.83,0.72),dash*0.85);

 // --- island bands (sand / grass / jungle / rock / ash) ---
 vec3 sand=texture(sand_c,p*0.10).rgb;
 vec3 grass=texture(grass_c,p*0.13).rgb;
 vec3 grass2=texture(grass_c,p*0.31+vec2(3.7,1.9)).rgb;
 vec3 rock=texture(rock_c,p*0.09).rgb;
 float wet_band=1.0-smoothstep(0.0,0.75,height);
 float grass_band=smoothstep(0.6,3.2,height)*(1.0-smoothstep(11.0,18.0,height));
 float jungle_band=smoothstep(3.0,6.2,height)*(1.0-smoothstep(12.0,19.0,height));
 float rock_band=smoothstep(10.0,16.0,height);
 vec3 mountain=mix(sand,grass,grass_band);
 mountain=mix(mountain,grass*vec3(0.62,0.78,0.55),jungle_band*0.85);
 mountain=mix(mountain,rock,rock_band);
 mountain=mix(mountain,sand*vec3(0.78,0.72,0.6),wet_band*0.92);
 mountain=mix(mountain,mix(grass2,grass,0.5),grass_band*(1.0-rock_band)*0.35);

 vec3 far_flat=mix(vec3(0.30,0.27,0.16),vec3(0.17,0.30,0.12),grass_band);
 far_flat=mix(far_flat,vec3(0.33,0.28,0.23),rock_band);
 far_flat=mix(far_flat,vec3(0.55,0.47,0.30),wet_band*0.9);
 vec3 mountain_final=mix(far_flat,mountain,detail);

 vec3 city_far=mix(vec3(0.36,0.35,0.33),asphalt*1.6,mask.r*0.8);
 city_far=mix(city_far,vec3(0.22,0.34,0.16),mask.g);
 city_far=mix(city_far,vec3(0.16,0.32,0.40),mask.b);
 vec3 city_final=mix(city_far,city_ground,detail);

 vec3 color=mix(mountain_final,city_final,city_mask);

 // cheap slope shading so relief reads under the sun
 float lambert=clamp(dot(world_normal,normalize(vec3(-0.52,0.78,-0.34))),0.0,1.0);
 float relief=mix(1.0,0.72+0.42*lambert,0.55);
 ALBEDO=color*relief;
 ROUGHNESS=mix(0.94,clamp(asphalt_rgh,0.55,0.95),mask.r*city_mask*detail);
 SPECULAR=0.28;
}
