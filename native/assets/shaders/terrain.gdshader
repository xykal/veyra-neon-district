shader_type spatial;
render_mode cull_disabled,unshaded,depth_draw_opaque;

uniform sampler2D grain_tex : source_color, filter_linear_mipmap, repeat_enable;
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
 vec3 dry_sand=vec3(0.72,0.58,0.30);
 vec3 grass_col=vec3(0.16,0.42,0.06);
 vec3 jungle_col=vec3(0.045,0.19,0.022);
 vec3 rock_col=vec3(0.26,0.20,0.155);
 vec3 ash_col=vec3(0.13,0.105,0.09);

 float wet_band=1.0-smoothstep(0.0,0.75,height);
 float dry_sand_band=smoothstep(0.3,1.5,height)*(1.0-smoothstep(2.6,4.2,height));
 float grass_band=smoothstep(0.6,3.2,height)*(1.0-smoothstep(11.0,18.0,height));
 float jungle_band=smoothstep(3.0,6.2,height)*(1.0-smoothstep(12.0,19.0,height));
 float rock_band=smoothstep(10.0,16.0,height)*(1.0-smoothstep(24.0,32.0,height));
 float ash_band=smoothstep(18.0,34.0,height);

 vec3 mountain=mix(dry_sand,grass_col,grass_band);
 mountain=mix(mountain,jungle_col,jungle_band);
 mountain=mix(mountain,rock_col,rock_band);
 mountain=mix(mountain,ash_col,ash_band);
 mountain=mix(mountain,wet_sand,wet_band*0.92);

 // Fake sun shading keeps relief readable in the cheap unshaded path.
 float lambert=clamp(dot(world_normal,normalize(vec3(-0.52,0.78,-0.34))),0.0,1.0);
 float relief=mix(0.82,0.58+0.42*lambert,detail);

 vec3 asphalt=mix(vec3(0.028,0.032,0.04),vec3(0.075,0.085,0.105),noise(p*0.11)*detail);
 asphalt+=vec3(0.06,0.065,0.08)*pow(max(0.0,lambert),3.0);
 vec3 pavement=mix(vec3(0.22,0.235,0.25),vec3(0.29,0.30,0.315),noise(p*0.08)*detail);
 float road=road_pattern(p);
 vec3 road_col=mix(pavement,asphalt,road);
 float dash=road_dash(p)*road*detail;
 road_col=mix(road_col,vec3(0.85,0.83,0.62),dash*0.72);
 road_col=mix(road_col,vec3(0.55,0.56,0.58),smoothstep(0.78,0.98,road)*(1.0-smoothstep(1.15,1.45,road))*detail);

 vec3 color=mix(mountain,road_col,city_mask);
 ALBEDO=color*(1.0+grain*0.055)*relief;
 ROUGHNESS=mix(0.98,0.82,road*city_mask);
}
