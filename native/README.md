# Veyra Native — 0.5.4-alpha.1

A **real Godot 4.7.2 native client** for Windows x64 and Android ARM64/ARMv7. This is not Electron, a browser shell, WebView, Unity, FiveM or GTA V. GDScript drives the native C++ engine, OpenGL-compatible renderer and Jolt physics.

**Download:** [native alpha release](https://github.com/xykal/veyra-neon-district/releases/tag/native-v0.5.4-alpha.1)

- `VeyraNative-Windows-x64.zip` — extract and run `VeyraNative.exe`; no .NET runtime required.
- `VeyraNative-Android-arm64.apk` — recommended for modern 64-bit Android phones.
- `VeyraNative-Android-armv7.apk` — legacy 32-bit ARM option, provided the device supports the required Android/OpenGL features.
- `SHA256SUMS.txt` — verify package integrity. The APKs use a persistent private release-signing key; Windows code signing is **not** configured. An unsigned Windows build may be flagged as an unfamiliar application; the APK is not a Play Store release.

## 0.5.4-alpha.1 — the realism pass: PBR world, sky, lighting, visual QA

The big one. The world no longer reads as flat-shaded boxes:

- **PBR textures (CC0, ambientCG)**: real albedo/roughness sets for asphalt, concrete, grass, rock, sand, brick and metal drive the terrain and building surfaces — texture splatting by height/slope (beach → grass → jungle → rock → ash), city mask keeps roads/parks/lots paved and green.
- **Custom sky**: hand-written sky shader — dusk-blue gradient with warm horizon, sun disc + glow, drifting fbm cloud deck with shaded undersides. Feeds sky-based ambient and reflections.
- **Lighting overhaul (GTA-style intent)**: ACES tonemapping with saturation/contrast adjustments, sky ambient + fill light so shadow sides never crush to black, higher sun with soft blurred shadows, SSAO + subtle additive bloom on Balanced/High.
- **Facade v2**: walls sample brick/concrete textures with normal perturbation, window bays keep frame reveal + sills + shop band, glass now picks up sky-tinted fresnel reflections.
- **Trees**: layered canopies with darkened undersides instead of flat green balls.
- **Visual QA tooling** (`tools/native-visual-audit.py`): automated pre-release validation — captures lobby/loading/city/street/avatar/vehicle/coast, checks exposure + contrast + error logs per frame, writes a contact sheet, exits non-zero on failure. This rig caught three real bugs before this release: a GLES3 sky-shader compile failure (`SUN_DIRECTION` unavailable — black sky = black ambient), an invalid shadow property that aborted environment setup mid-function, and crushed shadow-side lighting.
- **UI/UX carry-over** from the alpha.4 pass: hero lobby, glass HUD vitals, gold cash chip, speedometer arc, toast cards, loading percentage.

## 0.5.3-alpha.4 — professional quality overhaul

Full polish round — UI, models, city materials, clothing, SFX and motion:

- **UI system**: hero lobby (wordmark + accent bar + section cards), mint primary actions, look chips, styled pause/GPS/chat panels, pill interact prompt, horizontal toast cards, loading screen with live percentage, Outfit type family (variable OFL font included).
- **HUD**: glass vital card (HP/EN with icons + values), gold cash chip with icon + label, and a real speedometer — arc gauge with ticks, KM/H, gear (R/N/D) and vehicle name.
- **City materials**: new building facade shader — structured window bays with frame reveal, per-window curtain variation, sills, floor seams, ground-floor shop band with plinth, stucco grain, flat grey roof membranes. The 319-building palette moved to an architectural scheme (glass greys for towers, warm concrete/muted brick mid-rise, light stucco low-rise) with per-building tone jitter.
- **Vehicles**: all 20 GLBs rebuilt in Blender — sedans/suvs/taxi/police/race now share tapered greenhouses, wheel-arch cutouts, flush grilles, door handles, beltline chrome; `compact` and `race-future` were broken legacy meshes and are rebuilt proper. Richer paint (metallic/clearcoat feel) and dark glass.
- **Clothing**: streetwear attachment overhaul — the floating knee patches, crotch-clipping hood/jacket shells and sash-look bag strap are gone. Backpack sits on the back with clean twin straps, hood behind the neck, chest chain in front, jacket shell on the chest. Quaternius bone-frame offsets corrected (+z = back).
- **Audio**: deeper engine loops (odd-harmonic bite, sub rumble, 10 Hz AM), real starter whine + ignition clatter on engine_start, two-tone horn with vibrato and transient noise.
- **Motion**: steering/turn bank additive while driving or seated.

## 0.5.2-alpha.3 — city color truth & lane markings

Map pass on the city: sun energy dropped from 1.65 to 1.06 (warm walls were blowing out to neon yellow), the building palette desaturated into stucco/terracotta tropical tones with per-building lightness variation, roofs greyscaled, and real dashed lane markings now paint the 60 m street grid (kept out of intersections). Verified across four street views plus the bay hero shot.

## 0.5.2-alpha.2 — round wheels & true wheel-spin

Hotfix on the alpha.1 quality round: the Blender car kit exported with double-applied transforms, so wheels baked as flat discs and runtime wheel spin pivoted at the car centre. The export now keeps per-node transforms (wheel nodes sit at their hubs), wheels are proper discs, and the game renders every vehicle assembled (verified top-down + rear hero shots in-game). Also new: `B` emotes (dance loop with cloth rustle) and `Jump_Land` playback polish on landing.

## 0.5.2 Quality Round — Blender art, UI, map truth, full SFX

The quality pass the alpha needed: car and fashion art authored in real 3D software (Blender 4.2 headless), a redesigned lobby + loading splash, the map rendering truthfully again (a broken terrain shader had been failing silently and hiding the whole island surface behind the ocean plane), the animation set wired end-to-end, and every synthesized SFX actually playing in game.

- **Car kit v3 (`tools/native-blender-cars.py`)**: all 18 vehicles rebuilt in Blender as proper 3-box/fastback/SUV/pickup/van silhouettes in real metres — solidified panels with bevels, clearcoat paint, glass, chrome trim, head/tail lights, deeper wheels. `vehicle.gd` applies a uniform visual scale from the real vehicle length so nothing squashes. Verified in-game hero shot.
- **Streetwear GLB set (`tools/native-blender-fashion.py`)**: cap (crown + curved brim), crossbody bag + strap + buckle, hood roll, cargo pockets with flaps, chain links and a jacket shell — modeled at bone-attachment origins and tinted per look. No more primitive box "accessories".
- **Lobby UI/UX + loading splash**: Outfit (OFL) font, clear hierarchy (identity / looks / CTA / quality), look chips, glass panels; new original Lombok dusk loading art (`assets/boot_splash.png`) with gradient overlay, progress bar and tips.
- **Map truth**: `terrain.gdshader` rebuilt clean (a leftover `road` identifier was silently breaking shader compilation so terrain never drew); baked `city_mask.png` from `district.json` drives real asphalt roads, park grass, ponds and dirt lots; saturated tropical building palette + brighter tree tones in the shared map (web benefits too); fog thinned and warmed so the world is not pale blue wash. Benchmarks: `benchmarks/0.5.2-lombok-llvmpipe.json`.
- **Animations complete**: `Jump_Start`/`Jump_Land` on takeoff/landing, `Hit_Chest` on damage, `Interact` on F actions, plus the unarmed punch path (`Interact` + `punch`/`ragdoll_hit` SFX + ragdoll).
- **All SFX live**: UI/back/confirm clicks, brake squeal, police siren loops on active cruisers, engine idle→mid→high with stop, cloth rustle on jumps, punch melee, rain + thunder weather cycles, high-speed wind bed. 39 synthesized WAVs, all reachable in play.

## 0.5.1 Real Lombok Island

The island is now a real Lombok shell (outline, Gili islets, Rinjani crater + Segara Anak, rice terraces, warungs, docks, 22 Lombok POI names) with a FiveM-style light material pass, a 360° drag lobby with vault looks, realistic car finishes, bigger touch controls and snappier aim. See [PERFORMANCE-0.5.1.md](PERFORMANCE-0.5.1.md) for the same-harness comparison. Software llvmpipe numbers are not a physical Android FPS promise.

- **Custom splash / no Godot logo**: `assets/boot_splash.png` is an original Lombok-sunset Veyra boot art. The 0.5.1 settings probe fixes the key path (`boot_splash/*` inside `[application]`) so the engine logo is really gone; launcher icon is the original V mark.
- **Real Lombok island shell**: `tools/native-lombok-map.py` v3 writes `assets/island.json` (deterministic) with the Lombok coastline, Gili islets, Rinjani volcanic profile with crater and Segara Anak lake, terraces, palms/shrubs/grass, warungs, rocks, docks and villages; `district.json` carries 22 real Lombok POI names. Shared online city collision stays planar.
- **Streetwear character pass**: `tools/native-fashion.py` makes pants baggier/cargo, tops oversized and boots chunkier without touching the 65-bone rig or 20 clips. Runtime accessories add caps, crossbody bags, cargo pockets, cuffs and chains per preset.
- **Motion/SFX completeness**: smoother clip crossfades, additive lean/bob, jump/land layers, landing intensity, footstep surfaces, vehicle enter/exit/brake/scrape/impact and coastal ambient loops (39 synthesized WAVs).
- **Larger mobile controls**: pads scale up with `control_scale` (pause slider `UKURAN TOMBOL SENTUH`), stay clamped inside 960×540/1280×720/1600×720 and support independent steering, pedals and camera-look. Aim response is 1.35× with wider pitch so it no longer feels stiff.
- **AA/graphics detail**: Balanced uses 2× MSAA, High uses 4× MSAA; terrain is one unshaded surface with height-band palette (sand→grass→jungle→rock→ash), crater relief shading and distance-fade detail; separate ocean shader; vehicles get clearcoat paint/glass/chrome/emissive lamp finishes and body details. SAFE still boots with no MSAA/shadows and trims on memory warnings.
- **360° lobby + vault**: drag the character in the menu for a full 360° inspection, save/pick 3 vault looks, and read the new Lombok Is. title.

- One terrain surface replaces intersecting road/sidewalk/paint planes. Facade windows are filtered material detail instead of overlapping thin boxes. Original clothing is layered with clearance; always-hidden skin faces are cut offline, without Android GPU readbacks.
- Shared meshes/materials, bounded nearest-vehicle streaming, bounded staged model warmup and staged loading. Menu startup no longer builds the whole city or a second hidden player.
- Ragdoll bodies are built on first use; hidden animators are suspended. Leaving a session clears remote actors/vehicles and stops ragdoll simulation; capsule collision is restored on rejoin.
- Low uses 12 nearby vehicles/two practice actors, no MSAA/shadows, and conservative Android Auto selection. A memory warning activates safe mode rather than keeping every scene alive.
- New compact radar/vitals/driving HUD. Native per-pointer touch controls support steering, gas/brake and looking simultaneously; actual driver pedals replace the overloaded joystick-only setup.
- Pause/menu offers a non-sensitive diagnostics copy button for follow-up device/crash investigation.

## Prior alpha.2 correction

Inactive physical-bone colliders are disabled until ragdoll simulation actually starts. Driver entry immediately disables the capsule and registers a vehicle/player collision exception, preventing an occupied car from receiving phantom self-collision energy. Native tests now include entering a normal spawned car, leaving it idle on its suspension and safely exiting in the complete city. The exported Windows boot test also exercises that integration path. Audio players explicitly stop/release playback resources at shutdown.

## What is actually new

- Two artist-authored Quaternius CC0 adult humanoid base meshes, **65 articulated bones**, original weighted clothing additions and four CC0 hairstyles. Six native preset looks; these are not six independently authored base meshes.
- **20 retargeted authored animation clips**: idle, walk, jog, sprint, crouch, jump, driving, pistol actions, hits/death, interaction, sitting and dance. AnimationPlayer blends motion; fingers/skin/clothing use the imported skeleton rather than disconnected capsule limbs.
- Actual **PhysicalBone3D ragdolls** with constrained joints and Jolt collision. Low uses a simplified 11-body skeleton; other profiles use 15. Ragdoll tests advance the engine and check floor contacts/finite poses.
- Native capsule walking/jogging/sprinting, gravity/jump, orbit camera collision, local stamina and crouch animation.
- Offline native cars are **RigidBody3D** vehicles with four suspension rays, tyre forces, steering/braking, mass, body collisions and impact damage. They can pitch/roll and be reset upright. This is a raycast arcade vehicle model, not a validated automotive simulator.
- Thirty-eight original synthesized mono WAV sound effects/loops, played through native spatial audio: footsteps, engine, tyre skid, shot, impact, door, horn, siren, wind/rain, UI and landing sources. They are original DSP audio, not sampled commercial recordings or voice acting. Not every loop is used by every alpha gameplay state.
- Seeded city geometry, PBR/textured characters, procedural surface detail, instanced city batches, basic GPS/chat, touch controls and adaptive graphics.

The web version remains available at https://veyra-neon-district.dikanjut.workers.dev/ and is not replaced by this native alpha.

## Two modes — important limitations

### Latihan offline

Use this to try the native vehicle physics and ragdoll. **K / RAG** triggers a physical fall. The actors in this first build are practice citizens, not a complete AI social/mission simulation. Local practice state does not create online money or overwrite server progression.

### Masuk online

The native client uses actual `WebSocketPeer` connections to the **same existing authoritative city server**. Two native peers have been tested exchanging snapshots/chat and distinct resume identities. The adapter supports movement, vehicle entry/exit/driving inputs, wallet display, shooting/chat signalling and reconnection.

However, **the existing online server still owns planar vehicle/movement rules**. The offline native 6-DOF car simulation and local vertical jump are not secretly claimed to be a new fully authoritative 3D multiplayer server. Online car transforms come from server snapshots; manual ragdoll/jump is restricted rather than used as a position cheat.

The following are **not native feature parity yet**: WebRTC voice, recoverable accounts/party systems, full web wardrobe controls/three cloud look slots, interiors, climbing/swimming, advanced jobs/police AI and production-scale multiplayer/ragdoll synchronization. A native preset is sent on join; web-custom appearance fields may map to the closest native preset. The web version retains its existing features.

## Controls

| Input | Action |
|---|---|
| WASD | Move; throttle/reverse/steer in a vehicle |
| Shift | Sprint (local stamina) |
| Space | Jump offline / handbrake while driving |
| Ctrl | Crouch pose/movement |
| Mouse | Orbit camera; Escape releases it |
| RMB / LMB | Aim / fire |
| F | Enter a stopped free car / safe exit |
| H | Horn |
| K | Offline physical ragdoll/recover |
| R | Reset an offline overturned vehicle |
| G | GPS destination list |
| T | Text chat |
| Esc | Pause/settings/lobby |

Android uses a larger joystick, independent swipe-look and on-screen actions in landscape. Pads automatically scale and clamp for notched/small screens. Touch emulation does not certify every phone, GPU, Android vendor or thermal condition.

## Adaptive 2–8 GB target

| Preset | Initial intent | Budget |
|---|---|---|
| Low | 2–3 GB / older GLES3 hardware | 0.7 initial render scale, 30 FPS cap, no MSAA/sun shadows, 12 streamed cars, two practice actors, one ragdoll budget |
| Balanced | Around 4 GB | 0.85 scale, 2× MSAA, shadows, 24 streamed cars, four actors, two ragdolls, 60 FPS cap |
| High | 6–8 GB+ / stronger GPU | 1.0 scale, 4× MSAA, higher range/detail, 40 streamed cars, eight actors, three ragdolls, 60 FPS cap |

Android Auto starts conservatively in Safe mode rather than treating RAM as GPU speed. Auto can downgrade further after sustained low FPS, with hysteresis; High is manual opt-in. **RAM does not determine GPU speed, and these are configured targets/caps, not guaranteed frame rates.** The compatibility renderer was chosen for broader GLES3 coverage. GPU drivers, OS, chipset and heat still matter. Actual 2 GB and 8 GB physical phones have not been certified by the headless test suite.

## Identity and privacy

- Online resume identity is stored in the app's private `user://` data, not in public assets or build logs. Names remain display names, not authenticated accounts.
- Browser storage and native app storage are separate: a new install is not automatically the same browser identity. Uninstalling/clearing app data may lose access to that identity.
- No hosting/admin API keys are bundled. The APK requests Internet, not microphone/location/storage permissions for features that are not implemented.
- Voice is not requested or silently recorded. The menu can open the existing web client for its separate browser voice experience.

## Open the project / reproduce

1. Use **Godot 4.7.2 Standard** (not .NET). Official toolchain downloads are SHA-512 checked by `tools/native-setup.py`.
2. Open `native/project.godot`, let imports finish and run the main scene.
3. Headless tests:

```sh
python tools/native-setup.py --platform linux
python tools/native-test.py --godot /path/to/Godot
```

For Windows export, install the matching Windows template and run:

```sh
python tools/native-build.py --godot /path/to/Godot --target windows
```

For Android, install JDK 17+ and Android SDK/build tools, matching Godot Android templates, and set `JAVA_HOME`, `ANDROID_HOME`/`ANDROID_SDK_ROOT`. Signing values must be supplied privately through `GODOT_ANDROID_KEYSTORE_RELEASE_PATH`, `GODOT_ANDROID_KEYSTORE_RELEASE_USER`, and `GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD`; **never commit them**. Then use `--target android`. Build outputs are ignored under `dist/native/`. Release tags are treated as immutable across source commits: bump the native alpha tag/version before publishing another source revision.

The committed assets are sufficient for ordinary builds. To regenerate derived characters, download the official **free Standard** packs, not paid Source/Pro files, then use `tools/native-prepare-assets.py`, `tools/native-hair.py`, then `tools/native-mask-covered.py`. Provenance and original license texts are included in [CREDITS.md](CREDITS.md).

## Verification scope

- Native headless engine tests: authored skeleton/clip import, physical ragdoll joint bodies and floor contacts, real capsule wall/jump movement, suspension/drive forces, application boot and two native WebSocket peers.
- APK signatures/architecture/manifest are checked; exported Windows executable receives a native-run smoke check in Windows CI.
- Rendered screenshots use actual Godot with Mesa software rendering, not an AI-generated mockup and not a phone performance benchmark. `native/screenshots/island-0.5-*.png` shows the Lombok-inspired shell in-engine.
- No claim of AAA/FiveM equivalence, universal FPS, Play Store publication, Windows code-signing certification or complete device/security audit.
