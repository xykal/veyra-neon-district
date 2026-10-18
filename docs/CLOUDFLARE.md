# Cloudflare deployment: Veyra: Neon District

Veyra now has **two real server adapters** using the same authoritative gameplay and session code:

| Adapter | World owner | Saved progression |
|---|---|---|
| `npm start` / Docker | One Node process | Atomic `DATA_DIR/profiles.json` |
| Cloudflare Worker | One SQLite-backed `City` Durable Object | Private Durable Object SQLite |

The 3D and Lite clients are unchanged: both use same-origin WebSocket `/`, `/shared/` modules and the same game protocol. This is not a static-only Pages upload and does not need a separate VPS.

## Design

```text
Browser 3D / Lite
  ├── HTTPS files → Workers Static Assets (public/ + shared/ only)
  └── WSS /       → Worker → CITY.getByName('neon-district-v1')
                              ├── shared authoritative Game + WorldRoom
                              ├── 30 Hz simulation, 20 Hz snapshots
                              └── private SQLite profiles + leaderboard
```

- Every connection is routed to **one fixed object ID**. Autoscaled Worker entrypoints cannot accidentally create separate cities. Arbitrary URL parameters do not create more rooms.
- Default limit **16 concurrent connections**, 12 per IP and 8 opt-in microphones. These are safety limits, not a load-tested capacity promise.
- Server-owned controls, wallet, shooting, jobs, vehicles and voice-signalling rules are shared with Node.
- Native Cloudflare WebSockets replace the Node TCP/RFC6455 parser. Application messages remain bounded to 64 KiB, text-only and token-bucket rate limited.
- Only browser files and shared simulation modules are uploaded as public assets. Server code, database files, `.env`, `.dev.vars`, credentials and repository metadata are not public assets.
- `nodejs_compat` supplies Node crypto for SHA-256 identity hashes and secure random resume tokens. The Worker does not use a filesystem, a TCP listener, or Node's HTTP server.

Durable Objects provide a globally unique coordination point and colocated persistent storage [1](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/). Their native WebSocket support is intended for stateful multiplayer/room coordination [2](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## Local development and tests

Use **Node 22+**, preferably 24. Wrangler is pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts
npm run dev:cloudflare
# Open http://localhost:3000
```

Local storage is in `.wrangler/state/`, ignored by Git. Local development does not modify production storage. If exposing it to another device or a preview proxy, bind explicitly:

```sh
npm run dev:cloudflare -- --ip 0.0.0.0 --port 3000
```

Build and test without Cloudflare credentials:

```sh
npm run check
npm test                    # Node/game/JSON + real SQLite model tests
npm run build:cloudflare    # public asset staging + Worker dry-run bundle
npm run test:cloudflare     # real local workerd, SQLite, WebSockets, restart
npx playwright install --with-deps chromium
npm run test:e2e:cloudflare # same seven desktop/mobile/WebRTC cases on Workers
```

`test:cloudflare` starts and shuts down its own local runtime, uses a temporary database, and verifies persistence across an actual workerd restart. It does not require an account or contact a deployed game server.

## First production deploy

1. Use a Cloudflare account with Workers and **SQLite-backed Durable Objects** available. SQLite-backed objects are supported on the Free plan; paid upgrades are not required by this design [3](https://developers.cloudflare.com/durable-objects/platform/pricing/).
2. Create an API token limited to the intended account, with the permissions required to deploy Workers, assets and Durable Object migrations. Prefer **Edit Cloudflare Workers** template with the narrowest account resources; avoid a global API key.
3. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your private shell/session. Do not add them to Wrangler `vars`, JavaScript, public assets or Git.
4. Run:

```sh
npm ci --ignore-scripts
npm run build:cloudflare
npm run test:cloudflare
npm run deploy:cloudflare
```

5. Visit the generated **`https://veyra-neon-district.<your-subdomain>.workers.dev`** URL. Test two different browser profiles/devices, chat, movement and reload. `/healthz` reports `runtime: cloudflare-durable-objects`.
6. A custom domain is optional. Configure it in the Worker dashboard; no domain purchase is needed for `workers.dev`.

`wrangler.jsonc` includes Static Assets, a single `CITY` binding, and the `city-sql-v1` migration using **`new_sqlite_classes`**. Do not change the class name or delete its namespace to perform an ordinary code update; doing so can strand existing saves. Later schema changes need explicit migrations.

## GitHub Actions deploy

The normal CI workflow validates both server adapters before publishing. A production deployment is **opt-in**:

- Repository Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Repository Actions variables: `CLOUDFLARE_DEPLOY_ENABLED=true`, `CLOUDFLARE_PUBLIC_URL=https://your-worker.workers.dev`.
- Only pushes to `main` deploy; pull requests never receive the deployment credentials.
- The deploy job waits for Node 22/24 tests, both browser suites and the workerd integration job.
- It stamps the Git commit as `BUILD_SHA`, then checks public health/build identity, 3D/Lite/assets and a clean WSS upgrade. The smoke check creates no profile.
- Credentials are supplied only to the deploy step, not to test/build steps or frontend runtime variables.

Turn the variable to `false` to stop future automatic deployments without deleting live data. Do not disable CI validation to ship a broken Worker.

## Persistence and restart behavior

- SQLite stores SHA-256 profile keys and bounded wallet/statistics, **not the raw browser resume token**.
- New sessions and disconnects flush synchronously. Active-player snapshots are saved **every 30 seconds** in a SQL transaction. A sudden crash/deploy may lose up to the latest save interval.
- Cold starts read only the requested profile or ranked rows; offline profile history is not copied into an ever-growing RAM map.
- Leaderboard merges saved, dirty and live records by profile key; no double entries and no profile secrets in public responses.
- Live positions, vehicle ownership, health, wanted and weather are transient, as on Node. They are not checkpointed every frame.
- Deploy/restart closes inherited sockets with a restart code. Clients reconnect and restore saved progression into a fresh session instead of remaining attached to an empty world.
- The Node JSON file and Cloudflare database are **separate stores**. This release does not automatically import Node profiles. Changing site origins also changes which browser localStorage is available.
- Clearing browser site data loses access to that saved identity. This is not recoverable email/password authentication.

For recovery, use the provider's supported Durable Object SQLite point-in-time recovery facilities [4](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). Never expose SQL/admin/profile export endpoints publicly.

## Idle behavior, limits and cost

The simulation starts when a socket connects and stops when the last one leaves. It never runs an empty city 30 times per second. The Hibernation WebSocket API is used, but **an active game loop prevents hibernation**; it is not an always-running game for zero compute cost [2](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

- Worker Static Assets serve normal JS/GLB/CSS files without invoking the game object. Only `/`, `/healthz` and `/api/*` run the Worker first.
- Incoming player inputs/signalling, object duration, SQL rows and other provider usage count against quotas.
- The Free plan has daily limits; exceeding a limit causes operations to fail until reset. Paid plans have metered overage. Check the **current** official pricing and your dashboard [3](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- This repository does **not** subscribe to a paid plan, change billing or promise unlimited free players/24-hour capacity. A deploy on an existing paid account follows that account's billing.
- Keep the initial slot count small, configure provider budget alerts, and measure tick latency and traffic with real players before raising `MAX_PLAYERS`.

## Voice and mobile

Workers forwards WebRTC signalling only; microphone audio remains peer-to-peer. The default STUN setup, HTTPS permission requirement, optional TURN relay and max-eight-mic limitations are unchanged. See [HOSTING.md](HOSTING.md#voice--turn). Hosting on Cloudflare does not by itself supply a TURN relay.

The same mobile portrait/landscape/held-fire/joystick/GPS and WebRTC browser suite is run on both Node and Workers. Headless emulation is not an iPhone/Safari/physical-Android certification or a universal FPS guarantee.
