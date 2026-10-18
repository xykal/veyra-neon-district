# Native assets, engine and licensing

## Godot Engine

Godot 4.7.2, MIT. https://godotengine.org/license/ — full engine license is accessible in the app's Credits dialog through `Engine.get_license_text()`. Official download archive: https://godotengine.org/download/archive/4.7.2-stable/

The native runtime uses Godot's bundled Jolt physics implementation; additional Godot third-party notices are available through the engine's license information. The client is not endorsed by Godot, Jolt, Quaternius, Kenney, GTA or Rockstar.

## Artist-authored CC0 human/animation sources

**Quaternius Universal Base Characters — Standard (free)**

- https://quaternius.com/packs/universalbasecharacters.html
- https://quaternius.itch.io/universal-base-characters
- License: **CC0 1.0 Universal**, original text: `assets/people/QUATERNIUS-CHARACTERS-LICENSE.txt`.
- Official free Standard ZIP SHA-256: `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`.
- Male/female Superhero full-body glTF sources, including authored anatomy, face, UVs, normals, skin weights and 65-bone skeletons.
- Free Standard hairstyles: Simple Parted, Buzzed, Long and Buns. Prepared as head-local rigid meshes attached to the imported Head bone.

**Quaternius Universal Animation Library — Standard (free)**

- https://quaternius.itch.io/universal-animation-library
- License: **CC0 1.0 Universal**, original text: `assets/people/QUATERNIUS-ANIMATIONS-LICENSE.txt`.
- Official Standard ZIP SHA-256: `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`.
- Twenty selected free authored clips are retargeted in rest space; horizontal root motion is removed because the controller owns translation.

These are **not** Mixamo assets, photogrammetry/scanned humans or a paid Pro/Source pack. No payment/account-owned asset was required. Quaternius retains the source authorship; the project does not describe these as original Veyra human models.

### Veyra modifications

`tools/native-prepare-assets.py` embeds/downsamples maps to 512 px, adds original weighted garment meshes and retargets selected animations into the body skeleton. `tools/native-hair.py` bakes the CC0 hairstyles to head-local attachment space. `tools/native-mask-covered.py` removes only inner skin faces hidden by every shipped opaque garment, offline, while preserving the full skeleton and visible anatomy. `tools/native-fashion.py` applies the 0.5 baggy/oversized streetwear silhouette pass to garment POSITION bytes only. `tools/native-lombok-map.py` generates the expandable Lombok-inspired island shell data. The original modifications/tooling are MIT; the underlying Quaternius work remains CC0. Source preparation tools need NumPy/Pillow, but packaged games do not.

## Vehicles

Kenney Car Kit, CC0. https://kenney.nl/assets/car-kit . Existing model credits and source notices are retained in `assets/cars/CREDITS.md` and the repository's `THIRD_PARTY_NOTICES.md`. The Veyra city bus is an original MIT asset, not falsely attributed to Kenney. Generic models are not ripped GTA/FiveM assets.

## Original audio / other code

Thirty-eight seeded DSP-generated mono WAV sources are authored by Veyra contributors with `tools/native-audio.py`, MIT. They contain no samples from GTA, commercial music, recorded voice or third-party sound libraries. `assets/audio/manifest.json` records hashes/loop metadata.

Native gameplay scripts, UI, world-surface shaders (terrain/ocean/facade), original pistol geometry, generated city conversion, island shell tooling and build/test tools: MIT under the repository LICENSE. `assets/boot_splash.png` and `assets/icon_native.png` are original generated/branded Veyra art, not Godot branding.
