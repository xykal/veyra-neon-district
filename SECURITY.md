# Security / alpha deployment notes

Veyra is a playable prototype, not an audited public MMO platform. Do not trust browser state, nicknames or client-reported positions/money. The server accepts input/actions, not arbitrary wallet/state updates.

## Implemented baseline

- Bounded WebSocket frame/message buffering (64 KiB), client masking and UTF-8 validation, text fragmentation handling, heartbeat and closing on protocol errors.
- Per-connection token-bucket message limit; per-IP concurrent connection limit; stale input releases after 700 ms; snapshot backpressure dropping and upper queued-byte bound.
- Same-host browser Origin validation, with optional explicit `PUBLIC_ORIGIN`; same-origin browser WS endpoint.
- Static root restrictions; no data/server/environment files exposed; nosniff header; escaped chat/score/name display.
- Random 256-bit resume tokens stored locally; only SHA-256 identifiers stored server-side; one live session per profile. Names are not an authentication mechanism.
- Opt-in, muted-by-default WebRTC microphone; release/blur/visibility/disable cleanup; max 8 microphones.
- No credential in browser code, source, runtime artifact or Docker image. Real `.env` and progress data are excluded.
- Container starts with a minimal volume-permission initialization, then drops to non-root for the actual game process.

## Important remaining limits

No account recovery, verified identities, anti-bot challenge, comprehensive anti-cheat, admin/moderation console, ban list, matchmaking, room isolation, DDoS mitigation service, external database, multi-process coordinator, TURN credential issuer or formal security audit. WebRTC peers can learn each other's network addresses; use an appropriate relay policy/service if your product's privacy requirements demand it.

The hand-written RFC6455 transport is regression-tested for the supported subset, but has not undergone an independent protocol/security audit. Public large-scale deployment should consider a maintained audited WebSocket stack and additional infrastructure controls. TLS, origin/proxy policy, backups, TURN access control and platform budgets remain operator responsibilities.

For vulnerabilities, contact the repository owner privately using the contact options on their GitHub profile. Do not publish an active player's resume token, a hosting token, private profile file or a working credential in a public issue. Rotate any credential accidentally shared in a chat/log.
