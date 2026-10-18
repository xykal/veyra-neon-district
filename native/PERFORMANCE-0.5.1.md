# 0.5.1 — Real Lombok island render/perf notes

Same native Godot 4.7.2 render harness as 0.5.0: **1280×720 viewport, LOW profile, 0.7 render scale, uncapped**, 12 warmup frames + 30 sampled frames on Mesa llvmpipe software rendering. This is a host comparison, **not** a physical Android FPS guarantee.

| Metric | 0.5.0-lombok | 0.5.1-lombok | Delta |
|---|---:|---:|---:|
| frame_ms_mean | 41.68 | 41.90 | +0.22 |
| frame_ms_p95 | 46.76 | 48.77 | +2.01 |
| draw_calls_median | 85 | 102 | +17 |
| primitives_median | 30,023 | 30,659 | +636 |
| nodes | 3,436 | 3,528 | +92 |
| video_memory_mb | 43.34 | 43.46 | +0.12 |
| static_memory_mb | 119.62 | 120.81 | +1.19 |
| loaded_vehicles / actors | 12 / 2 | 12 / 2 | same |

Artifacts: `benchmarks/0.5.0-lombok-llvmpipe.json` and `benchmarks/0.5.1-lombok-llvmpipe.json`.

## What changed in 0.5.1

- **Real Lombok silhouette**: `tools/native-lombok-map.py` v3 → `assets/island.json` (sha256 `de5c01e0…6395`) with the Lombok outline, Gili islets, Rinjani (48 units, crater + Segara Anak lake), rice terraces, 370 palms, shrubs, grass, 22 warungs, docks, villages and the 22 renamed Mataram/Lombok POIs in `district.json`.
- **Terrain shader v2**: height-band palette (wet/dry sand → grass → jungle → rock → ash), volcanic crater profile, fake sun relief shading and distance-fade detail that removes procedural moire on grazing slopes. City keeps the planar asphalt/pavement shell so shared online collision never floats.
- **No more default-looking Godot boot**: boot splash keys fixed to `application/boot_splash/*` (the earlier `application/boot_splash` nesting was silently ignored, so the engine logo kept showing).
- **360° lobby + vault**: `LookStage` drag-rotates the character a full 360°, vault panel saves 3 outfit looks, pause menu gains a touch-size slider (`UKURAN TOMBOL SENTUH`).
- **Vehicle finish pass**: per-kind clearcoat paint (17 kinds), glass alpha, chrome/rubber, emissive head/tail lamps, mirrors, sport wings, exhaust and emergency bars on an unscaled detail node (fixes double-scaled floating bars).
- **Controls + aim**: touch pads scale up ~20% with `control_scale`, aim camera response 1.35× with wider pitch and faster FOV lerp (less stiff).

## What stayed bounded

- SAFE/LOW still starts with **no MSAA, no sun shadows, 12 streamed vehicles, 2 practice actors, 1 active ragdoll**, staged city loading and memory-warning safe mode.
- Static material palette remains ≤ 12 shared materials (`performance_smoke.gd` asserts this); vehicle finishes are keyed static caches shared per kind.
- Terrain is still one render surface; ocean is one low-cost surface; vegetation is batched MultiMesh with distance limits.
- Balanced enables 2× MSAA and High enables 4× MSAA.

## Interpretation

+0.22 ms mean on llvmpipe is noise-level: the island features got richer while the frame budget stayed flat. Draw calls rose by 17 (vehicle detail meshes + scenery batches) but primitives stayed nearly the same. Software numbers are not phone FPS; 2–3 GB devices should stay on SAFE/AUTO as before.
