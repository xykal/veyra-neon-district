# Verification scope — alpha 0.2.0

Date: 2026-10-18. The committed automated checks are run by GitHub Actions on every main push / pull request. The workflow status is authoritative for a particular commit; this document describes the test suite, not a perpetual guarantee.

## Automated Node checks (26 tests)

- Deterministic maps, 18 physics classes and 22 accessible POIs.
- All 484 POI-pair GPS routes avoid building/water blockers; 1,000 road-spawn samples remain in bounds.
- Finite acceleration/braking across vehicle classes, larger handbrake slip, vector collision impulse, front-impact damage.
- Vehicle entry/exit and ownership; full-distance wall occlusion for PvP; authoritative job reward; clamped invalid input.
- Nearby-entity snapshot interest management and server-only leaderboard statistics.
- HTTP health/static routes/ETag/security-path restrictions.
- Two raw WebSocket clients: hello, snapshots, broadcast chat, ping, leaderboard.
- Wallet/stats across actual server close/reconstruction, hashed-only server identity, same-name non-impersonation, duplicate-profile handover without rollback.
- Stale-control timeout; voice opt-in roster/target relay/talk/leave.
- Cross-origin WS refusal, unmasked frame rejection, fragmented text + interleaved ping, oversized frame and flood bounds.

## Chromium browser checks (7 tests)

1. Desktop true 3D: loads 17 GLB templates for 18 classes, GPS search/typing, stable quality count, reused route geometry, driving FX above 90 units/s without page errors.
2. Two independent browser contexts: real WebSocket snapshots, visible chat exchange, reload/resume token continuity, leaderboard panel.
3. 390×844 mobile emulation: actual CDP touch joystick and swipe look, repeated held fire reaching local authoritative simulation, release cleanup, clickable GPS/leaderboard/settings.
4. 844×390 landscape emulation: primary controls in bounds; touch-only panel opening/closing.
5. Simulated unavailable WebGL: automatic 2D fallback, successful multiplayer handshake.
6. Two real RTCPeerConnections using fake browser microphone: connected peers, received audio RTP bytes, no self-peer, push-to-talk release, delayed-permission early-release privacy regression, mic disable / peer cleanup.

7. Mobile 2D Lite: real multiplayer, hidden unsupported GPS/voice buttons, immediate touch-fire protocol delivery and no page errors.

The Docker publishing job also boots the newly published image, checks `/healthz`, confirms the data directory is writable as `node`, and verifies that the game PID is running as UID 1000.

## Local verification

```sh
npm ci --ignore-scripts
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
```

The browser suite starts its own isolated server on port 3101 and uses ignored `.test-data/browser`. Run without another service on that port. Reports/screenshots/traces go in ignored `test-results/` and `playwright-report/`. On CI, failure reports are uploaded as temporary Actions artifacts; test profiles are synthetic, not production users.

## What is NOT verified

- Physical low-end Android/iPhone, Safari/WebKit, controller input, mobile browser UI quirks, thermal throttling or battery use.
- Guaranteed FPS, universal compatibility, 64-player capacity, WAN packet loss/latency, large crowds or multi-hour soak testing.
- TURN relay traversal, carrier NAT/corporate firewall success, human listening quality or echo cancellation quality. Local fake-mic RTP is not proof that every real network/microphone will work.
- Production cloud service activation, domain/TLS ownership or paid plan configuration merely because deployment files are present.
- Full realistic vehicle dynamics. The driving simulation is planar/arcade with visual suspension, not 3D rigid-body physics; GPS destinations are POIs rather than functional interiors.

Headless software rendering is useful for correctness but **not a device performance benchmark**. The quality tiers, culling, touch UI and Lite fallback improve accessibility; they do not justify saying "smooth on every device." Test target devices and choose player limits/hosting based on actual measurements before a public launch.
