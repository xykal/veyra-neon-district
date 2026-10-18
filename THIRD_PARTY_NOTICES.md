# Third-party notices

## Three.js r160 / 0.160.1 — MIT

Vendored in `public/vendor/three.module.js`, `GLTFLoader.js`, and `BufferGeometryUtils.js`. Example-module import paths were adapted to local files. Runtime does not fetch Three.js from a CDN.

Upstream: https://github.com/mrdoob/three.js/tree/r160

The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Kenney Car Kit — CC0 1.0 Universal

Vehicle models other than `bus.glb`: Kenney, https://kenney.nl/assets/car-kit

License: Creative Commons CC0 1.0 Universal Public Domain Dedication:
https://creativecommons.org/publicdomain/zero/1.0/legalcode

Copies obtained through the following mirrors; attribution is retained even though CC0 does not require it:
- https://github.com/grvermeulen/H3-Teamy/tree/image/public/arena/cars
- https://github.com/Arslan12216775/kenney_car-kit/tree/master/Models/GLB%20format

Game changes: scale/orientation normalization, paint choices, wheel animation, synthetic lamps and suspension. See `public/assets/cars/CREDITS.md` for files.

## Original assets

Humanoid rig, procedural motorbike, original generated city bus (`bus.glb`), city geometry, UI/brand mark, audio synthesis and particle effects are project code/assets under the root MIT license.

No Rockstar, GTA or SA-MP game files, textures, models, names of locations, or soundtrack are included. Veyra is an independent sandbox prototype, not an official GTA/SA-MP product.

## Development tools

Playwright (`@playwright/test`) is a development-only dependency licensed Apache-2.0 by Microsoft Corporation. Its notices are included in the installed npm package. It is not shipped in the runtime bundle or Docker runtime image.
