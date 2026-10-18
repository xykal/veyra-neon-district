# 0.4.1 — low-memory Android performance / flicker / HUD pass

Target report: Android APK on a **2–3 GB RAM** device; severe lag, flicker, then closure/crash. No exact phone/GPU or logcat was supplied, so a particular Android crash cause is **not confirmed** and physical-device FPS is not certified.

## Measured comparison, not a marketing FPS promise

We reconstructed the shipped `eb41f34` / 0.4.0-alpha.2 source in a separate project and ran the same native Godot 4.7.2 render harness. Both captures use the same spawn, **1280×720 viewport, 0.7 3D scale, Low profile, uncapped render**, 12 warmup frames and 30 sampled frames on **Mesa llvmpipe / Linux software rendering**. No other game renderer was running. The workload intentionally changes through resource budgets, batching and material rendering. New HUD is included.

| Metric | Shipped 0.4.0 alpha.2 | 0.4.1 candidate |
|---|---:|---:|
| Mean host frame time | 131.94 ms | 38.77 ms |
| P95 host frame time | 143.38 ms | 45.41 ms |
| Draw calls, median | 149 | 78 |
| Render primitives, median | 26,977 | 13,089 |
| Scene nodes | 4,818 | 2,671 |
| Loaded vehicle instances | 110 | 12 |
| Loaded practice citizens | 4 | 2 |
| Reported video memory | 68.33 MiB | 42.67 MiB |
| Godot static memory monitor | 128.09 MiB | 113.52 MiB |
| Repeat-run startup to playable frame | 1,416 ms | 1,176 ms |

This sample gives about **3.4× lower mean frame cost / higher uncapped host throughput**, approximately 48% fewer draw calls and 38% less reported video memory. **It does not mean “26 FPS on every 2 GB phone” or “3.4× on every GPU.”** Software rendering, shader caches and OS/device differences matter. Static/video monitors are not a complete Android PSS/peak-RAM measurement.

An earlier first-run sample was 6.35 seconds versus a later 1.8-second working sample, but caches were not controlled between those samples. They are **not** the final fair repeat-run loading comparison above. Loading is also staged so the UI can present progress instead of blocking while every city asset is constructed.

Raw captures: `benchmarks/0.4.0-alpha2-low-llvmpipe.json`, `benchmarks/0.4.1-low-llvmpipe.json`. Reproduce with `tests/render_benchmark.gd` on an actual rendered display; headless Dummy rendering cannot measure real GPU draw cost. For example:

```sh
godot --path native --script res://tests/render_benchmark.gd -- --out=/path/profile.json --label=my-device-host
```

## Render/flicker corrections

- **One terrain surface**, not intersecting horizontal/vertical road boxes and stacked paint/sidewalk planes. The terrain material supplies the street layout/markings without coplanar z-fighting.
- **Facade window material detail**, not thin boxes competing with walls at only millimetres/centimetres of separation.
- A filtered, mipmapped micro-grain texture replaces unfiltered `sin/floor` pixel noise; facade borders use derivatives/distance fade instead of raw high-frequency edges.
- Shared unit meshes and material palettes; per-instance colour replaces unique material/mesh construction for each colour/fixture. Collision geometry is retained in compound static chunks.
- Safe profile disables MSAA and shadows; camera near/far are no longer `.07 / 420` for a roughly 65-metre view budget.
- Garment layers have intentional clearance. Source skin faces hidden by every opaque shipped outfit are removed **offline**, preserving the artist's visible face/hands/anatomy, weights, skeleton and clips. Original importer-generated LODs remain usable; Android does not read mesh buffers back from the GPU to build a runtime mask.

These remove identified sources of depth/material interference. Device-specific driver flicker still needs an actual device report if it persists.

## Memory, loading and session stability

- Boot shows the lobby without constructing the entire city or a duplicate hidden player. City generation has short staged work slices with progress.
- Native nearby cars are **bounded/streamed**, not all 110 instanced at once. Parked wheels no longer receive useless quaternion updates 60 times/second. Online new-car creation is rate limited instead of instantiating a snapshot burst in one callback.
- Small model preparation is staged on the main thread; unsafe renderer-resource handoff from threaded prefab instantiation is avoided. A bounded prefab cache supports nearby reuse.
- Ragdoll shapes/bodies are **lazy**, only created when a ragdoll starts; hidden preview/player/citizen animation is suspended.
- Returning to lobby clears remote actors and vehicles, stops player/citizen ragdolls, releases active audio loops and invalidates stale streaming work.
- Starting a fresh session explicitly restores the capsule/physics state, preventing the old ragdoll → lobby → rejoin path from leaving collision disabled.
- Android Auto starts conservatively instead of equating 6–8 GB RAM with a fast GPU. Downgrades use sustained-low-FPS hysteresis; they do not oscillate upward/downward every few frames.
- An OS memory-warning path trims caches and remote scenes and selects a safe rendering budget. It cannot override a hard OS/native-driver kill, and is not a complete crash-proof guarantee.

## HUD / mobile input

- Compact radar, real health/stamina, wallet, destination indicator, contextual vehicle prompt and unobtrusive driving telemetry. Debug FPS/RAM no longer fills the main HUD. No fake armour/fuel statistics.
- Circular vector pads with visible pressed state; independent pointers for steering, gas/brake, jump, aim/fire and looking. Car mode has distinct pedals/steering instead of overloading one joystick for everything.
- Input reset on pause/focus loss/mode change, adjustable look sensitivity, responsive layout and display-safe-area margins.
- Pause/settings contains **Copy diagnostics**. The report includes GPU/device name, render scale, frame/resource counters and last session stage, but excludes nickname, chat, resume token, hosting credentials and signing material. Do not clear app data to install an update; the signing key/package remain the same.

## Automated regression additions

- 64 native touch assertions: multiple held pads, third-finger look, independent releases, mouse/touch duplicate protection, joystick/aim/fire coexistence and multiple viewport sizes.
- 71 lifecycle/resource assertions: deferred startup, bounded streaming/actors/materials, single terrain/no old road/window layers, lazy physical bones, ragdoll/lobby/rejoin collision restore, cleanup across four cycles, memory warning and diagnostics privacy.
- Existing authored-asset/ragdoll, 3D capsule/jump, full-world driver entry/exit, exported application and two-native-peer multiplayer tests remain required.

Windows export is executed in Windows CI. Android packages are release-signed and architecture/signature checked; this is **not a physical Android gameplay or long thermal soak certification**. Please provide the exact phone model and a copied diagnostic report if a specific device still flickers, freezes or closes.
