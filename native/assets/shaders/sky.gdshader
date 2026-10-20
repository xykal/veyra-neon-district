shader_type sky;
render_mode use_debanding;
// Veyra sky: dusk-blue gradient, warm horizon band, sun disc + drifting fbm cloud deck.
uniform vec3 top_color : source_color = vec3(0.22, 0.46, 0.82);
uniform vec3 horizon_color : source_color = vec3(1.0, 0.86, 0.64);
uniform vec3 sun_color : source_color = vec3(1.0, 0.92, 0.78);
uniform vec3 cloud_color : source_color = vec3(1.0, 0.98, 0.95);
uniform vec3 cloud_shadow : source_color = vec3(0.55, 0.58, 0.66);
uniform float sun_energy = 1.0;
uniform float cloud_amount = 0.42;
uniform float cloud_height = 2.6;
uniform float time_speed = 0.004;
uniform vec3 sun_dir = vec3(-0.42, 0.72, -0.55);

float hash21(vec2 p){
 p = fract(p * vec2(233.34, 851.73));
 p += dot(p, p + 23.45);
 return fract(p.x * p.y);
}
float noise2(vec2 p){
 vec2 i = floor(p); vec2 f = fract(p);
 vec2 u = f * f * (3.0 - 2.0 * f);
 return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
 float v = 0.0; float a = 0.5;
 for (int i = 0; i < 4; i++){
  v += a * noise2(p);
  p = p * 2.03 + vec2(17.3, 9.1);
  a *= 0.55;
 }
 return v;
}

void sky(){
 vec3 dir = normalize(EYEDIR);
 float h = clamp(dir.y, -0.12, 1.0);
 // vertical gradient with warm band near horizon
 float grad = pow(clamp(h, 0.0, 1.0), 0.58);
 vec3 col = mix(horizon_color, top_color, grad);
 col = mix(col, horizon_color * 1.06, smoothstep(0.16, 0.0, abs(h)) * 0.55);
 // sun disc + glow
 float sun_amt = clamp(dot(dir, normalize(sun_dir)), 0.0, 1.0);
 col += sun_color * pow(sun_amt, 900.0) * 3.2 * sun_energy;
 col += sun_color * pow(sun_amt, 22.0) * 0.22 * sun_energy;
 col += horizon_color * pow(sun_amt, 4.0) * 0.10 * sun_energy;
 // clouds: project onto a virtual deck
 if (dir.y > 0.015){
  vec2 cuv = dir.xz / (dir.y + 0.09) * cloud_height;
  cuv += vec2(TIME * time_speed * 12.0, TIME * time_speed * 5.0);
  float n = fbm(cuv * 0.32);
  float n2 = fbm(cuv * 0.32 + vec2(0.62, 0.21) + n * 0.55);
  float cl = smoothstep(1.0 - cloud_amount, 1.0 - cloud_amount + 0.28, n2);
  float shade = smoothstep(0.2, 0.85, n);
  vec3 cc = mix(cloud_shadow, cloud_color, shade);
  float horizon_fade = smoothstep(0.015, 0.14, dir.y);
  col = mix(col, cc, cl * horizon_fade * 0.88);
 }
 COLOR = col;
}
