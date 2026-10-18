# Hosting Veyra: Neon District

## Architecture / what to choose

**Cloudflare is now supported natively:** see [CLOUDFLARE.md](CLOUDFLARE.md) for Workers + one SQLite-backed Durable Object, local workerd tests and Actions deployment. This keeps the same authoritative gameplay without a VPS. Static-only Pages is not enough. Vercel also has native WebSocket beta support, but this repository does not currently include a Vercel state-coordination adapter; it is not a claim that Vercel cannot serve WebSockets.

The alternative **Node/Docker adapter** uses one long-running Node 24 process to serve files, accept WebSocket clients and simulate one city. Player progress is in a JSON file. Use **one instance**, HTTPS, and a persistent volume. More replicas would create separate worlds and risk inconsistent progress.

Practical options:

| Path | Good starting point | Important |
|---|---|---|
| Render Web Service | Managed Docker, HTTPS, GitHub deploy | Attach paid persistent disk; Blueprint below provisions paid resources |
| Railway | GitHub Dockerfile deployment + public domain | Add Volume before real play; ephemeral filesystem is not progress storage |
| VPS | Full control, Docker Compose, Caddy | You maintain updates, firewall, backups and TURN |

Render documents long-lived WebSocket-capable web services, managed TLS and Docker deployment [1](https://render.com/docs/web-services) [2](https://render.com/docs/websocket). Its persistent disks preserve only the mounted directory and require a paid service [3](https://render.com/docs/disks). Railway maps a GitHub Dockerfile to a service and Docker volumes to Railway Volumes [4](https://docs.railway.com/guides/docker-compose); ordinary deployment storage is ephemeral [5](https://docs.railway.com/services).

No hosting plan, domain, paid service or cloud bill is activated by this repository. Provider pricing/limits can change—review the checkout screen before approving.

## Option A: Render (fewest manual settings)

1. Open Render Dashboard → **New → Blueprint**.
2. Connect GitHub and choose `xykal/veyra-neon-district`.
3. Review `render.yaml`. It requests:
   - Docker web service `veyra-neon-district`, **starter** plan.
   - Singapore as an example region; change it to the region nearest your actual players.
   - 1 GiB persistent disk mounted at `/app/data`.
   - `DATA_DIR=/app/data`; health check `/healthz`; one instance.
4. Check the provider's current charges, then approve only if acceptable.
5. Wait for deployment; visit the generated HTTPS URL. Use that same URL on two devices to test multiplayer.
6. Optionally add your domain and set `PUBLIC_ORIGIN=https://play.your-domain.example` (no trailing slash).

For a manual Web Service: connect the same repository, select Docker, use root `Dockerfile`, add the disk and environment variable above. Render supplies `PORT`; the server binds `0.0.0.0:$PORT`.

**Do not use a Static Site** for the complete game. A free/ephemeral service can be a disposable demo, but it must not be described as durable progression. This project's JSON approach requires a real persistent disk for durable saves.

## Option B: Railway

1. New Project → **Deploy from GitHub repo** → `xykal/veyra-neon-district`.
2. The included Dockerfile builds the app; `railway.json` sets health check `/healthz` and restart policy.
3. Add a **Volume**, mount path **`/app/data`**.
4. Add variables:

```text
NODE_ENV=production
DATA_DIR=/app/data
MAX_PLAYERS=32
```

5. Networking → generate a public domain, using the app's supplied `PORT`.
6. Deploy, open the generated **HTTPS** URL and test two clients.
7. Check usage/budget limits. Do not enable replicas; this version is one world / one volume / one service.

The container initializes volume ownership and drops to the non-root `node` user before starting the game. If using a custom non-root override, ensure the mounted directory is writable by UID/GID 1000.

## Option C: VPS + Docker Compose

Use any suitable Linux VPS. A **1 vCPU / 1 GiB RAM** machine is a reasonable *initial experiment*, not a promised player capacity. Choose a nearby region and load-test before advertising a slot count.

```sh
git clone https://github.com/xykal/veyra-neon-district.git
cd veyra-neon-district
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/healthz
docker compose logs --tail=50 game
```

- Keep the named volume `veyra-progress`. `docker compose down` keeps it; **`docker compose down -v` deletes it**.
- Put port 3000 behind a TLS reverse proxy. Restrict direct public access to 3000 if your proxy is on the same host.
- Start with `MAX_PLAYERS=16` or `32`, then measure CPU/tick responsiveness/bandwidth. `64` is a safety maximum, not a load-tested capacity.

### HTTPS with Caddy

Point your DNS A/AAAA records at the VPS and install Caddy. Example Caddyfile, replacing the domain:

```caddyfile
play.your-domain.example {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy handles WebSocket upgrades. Forward the original Host; set `PUBLIC_ORIGIN` if the deployment has a fixed public origin. The browser connects to same-origin `wss://...` automatically—never put `localhost` in browser-facing backend URLs.

### Updating

```sh
git pull --ff-only
docker compose up -d --build
```

Existing sockets disconnect during replacement. Clients reconnect with saved identity; wallet/statistics persist if the volume was kept. Vehicle ownership, position, health and wanted reset on a fresh session by design.

## GHCR image path

The Actions workflow builds/tests first, then pushes:

```text
ghcr.io/xykal/veyra-neon-district:latest
```

Multi-arch: amd64 + arm64. SHA and version-tag variants are emitted too. The workflow's built-in token is scoped only to the job; you do not add a personal GitHub token to the repository.

**Check package visibility** in GitHub → user **Packages** → package → **Package settings**. Newly created container packages may be private; the owner can change visibility to public if anonymous deployment pulls are desired. Private pulls require appropriate registry authentication. Deploying/building from the source Dockerfile works without relying on image visibility.

## Voice / TURN

Game movement and chat use WebSocket. Voice uses **WebRTC peer-to-peer audio**; the game server only forwards signalling. Default ICE uses Google's public STUN service after voice opt-in. STUN discovers addresses—it is not an audio relay.

Some carrier NATs, VPNs and corporate firewalls cannot establish direct peer links. For reliable cross-network production voice, configure your own coturn server or a managed TURN service and use short-lived credentials. Do not use a permanent hosting/admin API key as a browser TURN password.

Example environment **shape**, using your actual temporary TURN username/credential at deployment time:

```text
ICE_SERVERS=[{"urls":"stun:your-turn-host.example:3478"},{"urls":["turn:your-turn-host.example:3478?transport=udp","turns:your-turn-host.example:5349?transport=tcp"],"username":"temporary-user","credential":"temporary-turn-credential"}]
```

The server sends this ICE configuration to joined clients. **TURN credentials are necessarily visible to those clients**; rotate/time-limit them and impose provider-side quotas. There is no built-in TURN credential issuer yet. TURN is a separate network service; a normal HTTP web-service proxy is not a UDP TURN listener.

Voice requires HTTPS (or browser-trusted localhost), microphone permission, and a user gesture. No microphone is requested merely by opening the game. Hold **V / VOX**, release to mute; disable mic in settings to release the device. Default proximity radius is 900 world units; max 8 opted-in microphones. This mesh is not intended for 64 simultaneous speakers.

## Persistence / backups

- Live file: `/app/data/profiles.json` in the Docker/cloud configuration.
- Server-side keys are SHA-256 digests, not raw client resume tokens.
- Autosave every 10 seconds; graceful SIGTERM flushes the current state. A hard kill can lose the last autosave interval.
- Saves are atomic temp-file + rename. Corrupt/unreadable data causes startup failure rather than a silent reset; restore a known-good backup.
- Take scheduled backups using your provider's volume snapshots, or copy the file after a graceful shutdown.
- Restore into the same mount path and ensure UID 1000 can read/write it.
- Do not commit backups/profile data, enable public directory listing, or expose the data mount through a static file server.
- Clearing browser localStorage loses access to that identity. This is browser resume, not a recoverable email/password account system.

## Troubleshooting

| Symptom | Check |
|---|---|
| Stuck in connecting / demo fallback | Long-lived web service is running; correct port/host; WS upgrades enabled; firewall; service waking up |
| `403` on WebSocket | Origin/forwarded Host match; `PUBLIC_ORIGIN` exactly matches HTTPS origin |
| Progress resets after deploy | Persistent volume exists, `DATA_DIR` is inside it, same browser site data is retained |
| `EACCES` saving JSON | Volume owner/mode; default entrypoint initializes owner then drops privileges |
| Mic button unavailable | HTTPS, browser permission, embedded iframe microphone permission; try opening the deployed URL in its own tab |
| Voice works on Wi-Fi but not carrier data | TURN relay / short-lived ICE credentials needed |
| Low frame rate | Graphics → low/auto; landscape; close other GPU-heavy tabs; check WebGL support; use `/2d/` |
| Two tabs keep replacing each other | One active session per saved profile. Use different browser profiles for different players |
| Players seem to enter separate cities | Multiple replicas/services; use one instance in this alpha |

Production checklist: TLS, persistent storage + restore-tested backups, budget alert, correct origin, small tested slot count, TURN if needed, browser/device testing and a moderation/account plan before a larger public launch.
