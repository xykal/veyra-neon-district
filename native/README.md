# Veyra Native — 0.4.0-alpha.2

A **real Godot 4.7.2 native client** for Windows x64 and Android ARM64/ARMv7. This is not Electron, a browser shell, WebView, Unity, FiveM or GTA V. GDScript drives the native C++ engine, OpenGL-compatible renderer and Jolt physics.

**Download:** [native alpha release](https://github.com/xykal/veyra-neon-district/releases/tag/native-v0.4.0-alpha.2)

- `VeyraNative-Windows-x64.zip` — extract and run `VeyraNative.exe`; no .NET runtime required.
- `VeyraNative-Android-arm64.apk` — recommended for modern 64-bit Android phones.
- `VeyraNative-Android-armv7.apk` — legacy 32-bit ARM option, provided the device supports the required Android/OpenGL features.
- `SHA256SUMS.txt` — verify package integrity. The APKs use a persistent private release-signing key; Windows code signing is **not** configured. An unsigned Windows build may be flagged as an unfamiliar application; the APK is not a Play Store release.

## Alpha.2 correction

Inactive physical-bone colliders are disabled until ragdoll simulation actually starts. Driver entry immediately disables the capsule and registers a vehicle/player collision exception, preventing an occupied car from receiving phantom self-collision energy. Native tests now include entering a normal spawned car, leaving it idle on its suspension and safely exiting in the complete city. The exported Windows boot test also exercises that integration path. Audio players explicitly stop/release playback resources at shutdown.

## What is actually new

- Two artist-authored Quaternius CC0 adult humanoid base meshes, **65 articulated bones**, original weighted clothing additions and four CC0 hairstyles. Six native preset looks; these are not six independently authored base meshes.
- **20 retargeted authored animation clips**: idle, walk, jog, sprint, crouch, jump, driving, pistol actions, hits/death, interaction, sitting and dance. AnimationPlayer blends motion; fingers/skin/clothing use the imported skeleton rather than disconnected capsule limbs.
- Actual **PhysicalBone3D ragdolls** with constrained joints and Jolt collision. Low uses a simplified 11-body skeleton; other profiles use 15. Ragdoll tests advance the engine and check floor contacts/finite poses.
- Native capsule walking/jogging/sprinting, gravity/jump, orbit camera collision, local stamina and crouch animation.
- Offline native cars are **RigidBody3D** vehicles with four suspension rays, tyre forces, steering/braking, mass, body collisions and impact damage. They can pitch/roll and be reset upright. This is a raycast arcade vehicle model, not a validated automotive simulator.
- Seventeen original synthesized mono WAV sound effects/loops, played through native spatial audio: footsteps, engine, tyre skid, shot, impact, door, horn, siren, wind/rain, UI and landing sources. They are original DSP audio, not sampled commercial recordings or voice acting. Not every loop is used by every alpha gameplay state.
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

Android uses a joystick, independent swipe-look and on-screen actions in landscape. Touch emulation does not certify every phone, GPU, Android vendor or thermal condition.

## Adaptive 2–8 GB target

| Preset | Initial intent | Budget |
|---|---|---|
| Low | 2–3 GB / older GLES3 hardware | 0.7 render scale, 30 FPS cap, no sun shadows, four practice actors, one active ragdoll budget |
| Balanced | Around 4 GB | 0.85 scale, shadows, eight actors, three ragdolls, 60 FPS cap |
| High | 6–8 GB+ / stronger GPU | 1.0 scale, higher range/detail, fourteen actors, six ragdolls, 60 FPS cap |

Auto selects using available OS memory information and can downgrade when measured FPS stays low. **RAM does not determine GPU speed, and these are configured targets/caps, not guaranteed frame rates.** The compatibility renderer was chosen for broader GLES3 coverage. GPU drivers, OS, chipset and heat still matter. Actual 2 GB and 8 GB physical phones have not been certified by the headless test suite.

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

The committed assets are sufficient for ordinary builds. To regenerate derived characters, download the official **free Standard** packs, not paid Source/Pro files, then use `tools/native-prepare-assets.py` and `tools/native-hair.py`. Provenance and original license texts are included in [CREDITS.md](CREDITS.md).

## Verification scope

- Native headless engine tests: authored skeleton/clip import, physical ragdoll joint bodies and floor contacts, real capsule wall/jump movement, suspension/drive forces, application boot and two native WebSocket peers.
- APK signatures/architecture/manifest are checked; exported Windows executable receives a native-run smoke check in Windows CI.
- Rendered screenshots use actual Godot with Mesa software rendering, not an AI-generated mockup and not a phone performance benchmark.
- No claim of AAA/FiveM equivalence, universal FPS, Play Store publication, Windows code-signing certification or complete device/security audit.
