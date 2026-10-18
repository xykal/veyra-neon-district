# 0.5.0 — Lombok Direction render/perf notes

Same native Godot 4.7.2 render harness as 0.4.1: **1280×720 viewport, LOW profile, 0.7 render scale, uncapped**, 12 warmup frames + 30 sampled frames on Mesa llvmpipe software rendering. This is a host comparison, **not** a physical Android FPS guarantee.

| Metric | 0.4.1-alpha.1 | 0.5.0-lombok | Delta |
|---|---:|---:|---:|
| frame_ms_mean | 38.77 | 41.68 | +2.91 |
| frame_ms_p95 | 45.41 | 46.76 | +1.35 |
| draw_calls_median | 78 | 85 | +7 |
| primitives_median | 13,089 | 30,023 | +16,934 |
| nodes | 2,671 | 3,436 | +765 |
| video_memory_mb | 42.67 | 43.34 | +0.67 |
| static_memory_mb | 113.52 | 119.62 | +6.10 |
| loaded_vehicles / actors | 12 / 2 | 12 / 2 | same |

Artifacts: `benchmarks/0.4.1-low-llvmpipe.json` and `benchmarks/0.5.0-lombok-llvmpipe.json`.

## Why the cost increased

0.5 intentionally adds the Lombok-inspired island shell (terrain height mesh, ocean surface, palms/shrubs/grass, warungs, rocks, docks, rice terraces) and a richer unshaded terrain palette. Draw calls rise by seven batched MultiMesh groups; primitives roughly double because the terrain grid and vegetation exist now.

## What stayed bounded

- SAFE/LOW still starts with **no MSAA, no sun shadows, 12 streamed vehicles, 2 practice actors, 1 active ragdoll**, staged city loading and memory-warning safe mode.
- Static material palette remains ≤ 12 shared materials (`performance_smoke.gd` asserts this).
- Terrain is still one render surface; ocean is one extra low-cost surface; vegetation is batched MultiMesh, not individual nodes.
- Balanced enables 2× MSAA and High enables 4× MSAA. SAFE does not allocate MSAA.

## Interpretation

The +2.91 ms mean on llvmpipe is the price of the richer island shell on a software rasterizer. It is not evidence of a phone regression or improvement. The 0.4.1 budgets remain the crash-avoidance baseline; users on 2–3 GB devices should stay on SAFE/AUTO.
