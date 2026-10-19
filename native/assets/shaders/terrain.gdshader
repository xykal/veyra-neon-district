shader_type spatial;
render_mode cull_disabled,unshaded,depth_draw_opaque,fog_disabled;

uniform sampler2D grain_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D map_tex : filter_linear_mipmap, repeat_disable;
uniform float world_size = 480.0;
uniform float flat_radius = 250.0;

varying vec3 world_pos;
varying vec3 world_normal;

float hash21(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
float noise(vec2 p){
 vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
 return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),u.y);
}
float road_pattern(vec2 p){
 float cell=60.0;
 float dx=abs(mod(p.x,cell)-cell*.5);
 float dz=abs(mod(p.y,cell)-cell*.5);
 float road=min(dx,dz);
 float width=4.8;
 return 1.0-smoothstep(width-0.22,width+0.22,road);
}
float road_dash(vec2 p){
 float along=abs(mod(p.x,3.0)-1.5);
 float lateral=abs(mod(p.y,60.0)-30.0);
 float dash=1.0-smoothstep(0.12,0.2,along);
 dash*=1.0-smoothstep(0.06,0.12,lateral);
 dash*=step(mod(p.x,60.0),52.0);
 return dash;
}

void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 world_normal=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);
}

void fragment(){
 float height=world_pos.y;
 vec2 p=world_pos.xz;

 // City rect keeps the shared planar shell fully paved; island relief surrounds it.
 vec2 dc=abs(world_pos.xz-vec2(world_size*.5))-vec2(world_size*.5);
 float rect_d=length(max(dc,vec2(0.0)))+min(max(dc.x,dc.y),0.0);
 float city_mask=1.0-smoothstep(0.0,26.0,rect_d);

 // Distance fade kills procedural moire on distant grazing slopes.
 float dcam=length(world_pos-CAMERA_POSITION_WORLD);
 float detail=1.0-smoothstep(70.0,190.0,dcam);

 float grain=mix(1.0,texture(grain_tex,p*0.5).r*1.15,0.55*detail);

 vec3 wet_sand=vec3(0.30,0.24,0.12);
 vec3 dry_sand=vec3(0.74,0.60,0.32);
 vec3 grass_col=vec3(0.19,0.47,0.10);
 vec3 jungle_col=vec3(0.09,0.28,0.05);
 vec3 rock_col=vec3(0.37,0.31,0.25);
 vec3 ash_col=vec3(0.24,0.215,0.20);

 float wet_band=1.0-smoothstep(0.0,0.75,height);
 float grass_band=smoothstep(0.6,3.2,height)*(1.0-smoothstep(11.0,18.0,height));
 float jungle_band=smoothstep(3.0,6.2,height)*(1.0-smoothstep(12.0,19.0,height));
 float rock_band=smoothstep(10.0,16.0,height)*(1.0-smoothstep(24.0,32.0,height));
 float ash_band=smoothstep(18.0,34.0,height);

 vec3 mountain=mix(dry_sand,grass_col,grass_band);
 mountain=mix(mountain,jungle_col,jungle_band);
 mountain=mix(mountain,rock_col,rock_band);
 mountain=mix(mountain,ash_col,ash_band);
 mountain=mix(mountain,wet_sand,wet_band*0.92);

 float lambert=clamp(dot(world_normal,normalize(vec3(-0.52,0.78,-0.34))),0.0,1.0);
 float relief=mix(0.92,0.68+0.40*lambert,detail);

 vec2 muv=clamp(p/world_size,vec2(0.002),vec2(0.998));
 vec4 mask=texture(map_tex,muv);
 vec3 asphalt=mix(vec3(0.105,0.115,0.135),vec3(0.155,0.165,0.185),noise(p*0.11)*detail);
 asphalt+=vec3(0.05,0.055,0.07)*pow(max(0.0,lambert),3.0);
 vec3 pavement=mix(vec3(0.42,0.405,0.375),vec3(0.50,0.48,0.445),noise(p*0.08)*detail);
 vec3 lot_dirt=mix(vec3(0.33,0.27,0.19),vec3(0.42,0.35,0.24),noise(p*0.13)*detail);
 vec3 park_grass=mix(vec3(0.17,0.42,0.09),vec3(0.24,0.52,0.12),noise(p*0.09)*detail);
 vec3 water_col=vec3(0.10,0.31,0.40);
 vec3 city_ground=pavement;
 city_ground=mix(city_ground,lot_dirt,mask.a);
 city_ground=mix(city_ground,park_grass,mask.g);
 city_ground=mix(city_ground,water_col,mask.b);
 city_ground=mix(city_ground,asphalt,mask.r);
 city_ground=mix(city_ground,vec3(0.62,0.60,0.55),smoothstep(0.25,0.5,mask.r)*(1.0-smoothstep(0.5,0.78,mask.r))*0.35*detail);
 // Lane markings: 4 m dash on the 60 m street grid, only on asphalt core.
 float gx=min(fract(p.x/60.0),1.0-fract(p.x/60.0))*60.0;
 float gz=min(fract(p.y/60.0),1.0-fract(p.y/60.0))*60.0;
 float on_v=step(gx,0.065);
 float on_h=step(gz,0.065);
 float seg_v=step(fract(p.y/8.0),0.36);
 float seg_h=step(fract(p.x/8.0),0.36);
 float road_core=smoothstep(0.72,0.92,mask.r);
 float cross=on_v*on_h;
 float dash=max(on_v*seg_v*(1.0-on_h),on_h*seg_h*(1.0-on_v))*(1.0-cross)*road_core*city_mask*(0.35+0.65*detail);
 city_ground=mix(city_ground,vec3(0.82,0.80,0.70),dash*0.8);

 vec3 color=mix(mountain,city_ground,city_mask);
 ALBEDO=color*(1.0+grain*0.055)*relief;
 ROUGHNESS=mix(0.98,0.82,mask.r*city_mask);
}
