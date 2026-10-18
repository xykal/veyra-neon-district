# Veyra 0.3 — Identity Studio and controller overhaul

This update addresses the reported backwards-looking character/arms, uncomfortable controls, physical overlap and unreliable car entry. It remains an original browser game, **not FiveM, GTA V, or a drop-in GTA asset/engine port**.

## Playing

- **WASD**: camera-relative jogging, **Shift**: sprint. Analog touch travel supports slower movement; full travel sprints.
- **Mouse/drag/swipe**: orbit the camera. The unlocked cursor can move over HUD/buttons without changing world heading.
- The online join path waits for a real server welcome; a slow join no longer silently turns into a single-player demo. Offline play is explicitly selected. GPU resources are released on page exit/refresh.
- First desktop canvas click captures camera control; **RMB** aims and **LMB** fires after capture. Aiming/shooting temporarily raises the pistol; idle/jogging does not stay in an always-aiming pose.
- **F / NAIK**: approach the side of a stopped free vehicle. The proximity prompt identifies it and highlights eligible entry. Moving or occupied cars cannot silently steal the selection from a free parked car.
- **F / TURUN**: slow to under the safe exit threshold. The server tries free sides/offsets, avoids water/walls/other vehicles and stays seated with an explanation if both sides are blocked.
- **K** or Settings → **Studio karakter**: change your appearance while on foot. Save returns to play; cancel retains the current live look. Money and identity do not reset.

The mobile lobby has an always-available name/join bar while customizing, instead of burying the launch action below a long form. The original launch form remains accessible too.

## Identity Studio

- Six original body presets: Raka, Kai, Atlas, Naya, Luna and Asha. They vary in proportions; names are cosmetic presets, not separate account identities or stat classes.
- Eight hairstyles; five top styles (T-shirt/jacket/hoodie/overshirt/vest); four bottoms (jeans/cargo/shorts/jogger); four footwear styles; skin, hair and clothing colour palettes; glasses, cap and beanie.
- **Three saved looks are device-local.** The active look is also server validated, replicated in snapshots and saved in Node JSON / Cloudflare SQLite. This is not cloud synchronization of all three look slots.
- A bounded enum schema rejects arbitrary asset URLs/oversized style values. Cosmetics cannot set health, position, speed, money or other gameplay statistics.
- The wardrobe preview uses the same original character rig and the game's existing WebGL renderer. It does not allocate a second GPU context.

## Character rendering and animation

One vertex-coloured **GPU-skinned body mesh**, 15 bones, distinct modular clothing/hair geometry and a bounded/ref-counted geometry cache. The skeleton supports blended idle/walk/jog/sprint/aim/seated/riding poses. Sagittal two-bone leg targets and distance-driven cadence reduce the old disconnected swinging/foot sliding. Forward is consistently +X in model space and `(cos(a), sin(a))` in world space; arm aim and muzzle transforms use that same convention.

This is a stylized original parametric citizen, **not photorealistic scanned skin, motion capture, soft cloth simulation or a full GTA animation graph**. Seated drivers/riders use a pose; the source car meshes do not contain articulated door panels, so this release does not pretend to offer a real door-opening animation.

## Physics and networking

- **Scale:** approximately 10 world units per metre. Character proportions and the follow camera were brought closer to vehicle/street scale; old on-foot speeds were reduced from car-like speeds to roughly jogging/sprinting speeds.
- Fixed **60 Hz** authoritative substeps, scheduled by the existing 30 Hz room timer. A separate accumulator emits approximately 20 snapshots/second rather than a timer threshold that effectively undershot its target.
- Swept/subdivided capsule movement, full oriented vehicle box SAT contact against world/other vehicles, penetration repair, mass-based impulses, tyre slip, speed-limited steering, longitudinal drag, braking/reverse separation and impact damage.
- Trees, street poles/signals, benches, hydrants/bins, bus-stop posts, parked vehicles and other actor capsules participate in ground contact. Collidable props remain rendered at low quality; the graphics tier does not create invisible obstacles by deleting their meshes.
- Rendered car lengths and widths are normalized from actual GLB bounds to match authoritative dimensions. Suspension acts in the car's local axes; wheel steering/spin retains original node transforms.
- Local input prediction and bounded acknowledged replay improve response without trusting client coordinates. Static/vehicle/actor constraints are reapplied after visual correction. Large server corrections win.
- A swept camera sphere stops before building volumes; camera interpolation is constrained too. The old artificial 82%-minimum follow distance and whole-building ghosting are no longer used to hide a camera inside a wall.

### Deliberate limits

Driving/world contact is still a **planar arcade simulation**, not full 3D rigid-body vehicle suspension, jumping/climbing, interiors, vertical road geometry, deformable chassis or physical ragdolls. Actor knockdown poses are visual. Dense pathological pile-ups, network loss and every device have not been exhaustively proven penetration-free. Sixteen configured slots are a safety bound, not a certified capacity.

Adding C#/.NET or assembly by itself would not solve inconsistent axes, undersized colliders or incorrect interaction selection. The tested shared runtime remains JavaScript/Three.js on Node or Cloudflare; no untested language/engine rewrite is claimed.

## Persistence and browser cache

- Wallet/hashed identity rows remain intact. Cloudflare adds an `appearance` column without deleting the table or replacing the Durable Object namespace. Cold restore and legacy-wallet migration are tested.
- Root HTML loads `/r/0.3.0/public/main.js` and matching CSS. Relative imports stay in that release namespace, so a refresh cannot accidentally keep the 0.2 character/controller with 0.3 protocol/render code.
- After an update, **refresh the page**. Older clients are given an update message; an already-running old page is not magically rewritten in place.

## Verification

- 48 Node/game/SQLite/character/prediction tests on Node 22 and 24.
- Eight integration cases on real local workerd/SQLite/native WebSockets; restart retains a changed outfit.
- Ten Chromium cases **per backend**, including actual keyboard F and mobile NAIK/TURUN from normal spawn, studio/live wardrobe/reload, camera-facing/wall/body-bound regressions and existing GPS/chat/WebRTC/privacy coverage.
- Deployment is gated by both backend suites and public health/assets/WSS checks. Physical Android/iPhone/Safari, human WAN voice, AAA realism and universal FPS are not certified by headless tests.
