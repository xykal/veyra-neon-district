shader_type spatial;
// Veyra facade v2: textured wall (brick/concrete/plaster blend), window bays with
// frame reveal + sills, ground-floor shop band, fresnel glass, roof membrane.
uniform sampler2D brick_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D brick_n : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D concrete_c : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D concrete_n : hint_normal, filter_linear_mipmap, repeat_enable;
varying vec3 world_pos;
varying vec3 world_normal;
void vertex(){
 world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 world_normal=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);
}
float rect_mask(vec2 uv,vec2 lo,vec2 hi,vec2 aa){
 vec2 a=smoothstep(lo-aa,lo+aa,uv);
 vec2 b=1.0-smoothstep(hi-aa,hi+aa,uv);
 return a.x*a.y*b.x*b.y;
}
float hash21(vec2 p){
 p=fract(p*vec2(123.34,456.21));
 p+=dot(p,p+45.32);
 return fract(p.x*p.y);
}
void fragment(){
 bool is_roof=abs(world_normal.y)>0.7;
 vec3 base=COLOR.rgb;
 if(is_roof){
  float n=hash21(floor(world_pos.xz*3.0));
  vec3 r=texture(concrete_c,world_pos.xz*0.22).rgb*base*1.35*(0.94+0.12*n);
  ALBEDO=mix(vec3(dot(r,vec3(0.333))),r,0.55);
  ROUGHNESS=0.95;
 }else{
  vec2 uv=(abs(world_normal.x)>0.7?world_pos.zy:world_pos.xy);
  float style=hash21(floor(world_pos.xz/18.0));
  // wall texture blend: brick vs concrete vs fine plaster per block
  float brickness=step(0.72,style);
  float concreteness=step(0.38,style)*(1.0-brickness);
  vec3 tex_c=texture(concrete_c,uv*0.13).rgb;
  tex_c=mix(tex_c,texture(brick_c,uv*0.11).rgb,brickness);
  vec3 nrm=texture(concrete_n,uv*0.13).xyz*2.0-1.0;
  nrm=mix(nrm,texture(brick_n,uv*0.11).xyz*2.0-1.0,brickness);
  float floor_h=2.9+0.55*style;
  float col_w=2.5+0.85*hash21(vec2(style,7.7));
  vec2 tuv=uv/vec2(col_w,floor_h);
  vec2 tile=fract(tuv);
  vec2 aa=max(fwidth(tuv),vec2(0.002));
  float detail=1.0-smoothstep(48.0,78.0,distance(CAMERA_POSITION_WORLD,world_pos));
  vec3 wall=base*(0.72+0.62*tex_c);
  float ao=0.80+0.20*smoothstep(0.0,2.4,world_pos.y);
  wall*=ao;
  // per-window curtain variation
  float wvar=hash21(floor(tuv)+vec2(style,3.1));
  float ground=1.0-smoothstep(2.6,3.15,world_pos.y);
  float plinth=1.0-smoothstep(0.85,1.05,world_pos.y);
  wall=mix(wall,base*0.42,plinth*ground);
  float shop=rect_mask(tile,vec2(0.10,0.0),vec2(0.90,0.97),aa)*ground*step(1.05,world_pos.y)*detail;
  wall=mix(wall,vec3(0.075,0.125,0.155),shop);
  float upper=step(3.2,world_pos.y);
  float frame=rect_mask(tile,vec2(0.26,0.255),vec2(0.74,0.825),aa)*upper*detail;
  float glass=rect_mask(tile,vec2(0.305,0.30),vec2(0.695,0.78),aa)*upper*detail;
  float sill=rect_mask(tile,vec2(0.215,0.215),vec2(0.785,0.25),aa)*upper*detail;
  // glass: sky-tinted reflection + per-window interior tone
  vec3 view_dir=normalize(CAMERA_POSITION_WORLD-world_pos);
  float fresnel=pow(1.0-clamp(dot(view_dir,world_normal),0.0,1.0),2.2);
  vec3 sky_ref=vec3(0.52,0.66,0.78);
  vec3 glass_col=mix(vec3(0.085,0.145,0.185),vec3(0.17,0.25,0.29),wvar*0.55);
  glass_col=mix(glass_col,vec3(0.23,0.26,0.235),step(0.84,wvar)*0.55);
  glass_col=mix(glass_col,sky_ref,fresnel*0.42);
  wall=mix(wall,base*0.6,frame);
  wall=mix(wall,glass_col,glass);
  wall=mix(wall,base*1.12,sill);
  float seam=rect_mask(tile,vec2(0.0,0.02),vec2(1.0,0.05),aa)*upper*detail;
  wall=mix(wall,base*0.82,seam*0.65);
  ALBEDO=wall;
  ROUGHNESS=mix(0.9,0.22,glass);
  METALLIC=glass*0.28;
  // cheap normal perturbation from wall normal map (windows sit on top)
  vec3 wn=normalize(world_normal);
  vec3 tang=normalize(cross(wn,vec3(0.0,1.0,0.001)));
  vec3 bit=cross(wn,tang);
  NORMAL=normalize(wn+(tang*clamp(nrm.x,-1.0,1.0)+bit*clamp(nrm.y,-1.0,1.0))*0.22*(1.0-glass)*(1.0-shop)*detail);
 }
}
