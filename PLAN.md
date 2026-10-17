# spoty — port to Spotify's local/first-party API (working plan)

> **Resume here.** This is the living status file for the port. Read this first,
> then `docs/spotify-port.md` for the endpoint/payload reference.
> Keep this file updated as work progresses — check items off, log decisions,
> note exactly where you stopped. It is the contract between sessions.

## Background (one paragraph)

Spotify nuked the public Web API for developer apps (Nov 2025). Auth was moved
to spotatui's approach: **OAuth device pairing** (`spotify.com/pair`) against
Spotify's own desktop client ID `65b708073fc0480ea92a077233ca87bd` — first-party
tokens, no developer app, no callback server. **But `api.spotify.com` also
blanket-429s that client ID permanently**, so every API call must move to
Spotify's internal endpoints (`spclient.wg.spotify.com` + pathfinder), exactly
like spotatui does. Full validated endpoint specs, payloads, protobuf message
names, and persisted query hashes: **`docs/spotify-port.md`**.

## Status: Phases A+B complete — Phase C next

### Done ✅
- [x] Node 18 → 24 (`.node-version`, `engines`, `@types/node`); `yarn tsc` clean
- [x] Pairing auth in `src/util/spotify.ts` (`requestPairingCode` /
      `pollForPairing` / `refreshTokens`; dead refresh token → clear + re-pair)
- [x] Removed hono callback server + PKCE + `hono`/`@hono/node-server` deps
- [x] Login tested end-to-end; token carries every needed scope
- [x] `protobufjs` dep added; protos vendored to `proto/` (10 files) and
      verified to load (message names listed in port doc §Vendored)
- [x] Error surfacing fixed (no more `[object Object]` / "Login failed" lies)
- [x] This plan + `AGENTS.md` + `docs/spotify-port.md` written
- [x] **Phase A — player state + devices** (2026-10-17, validated live with
      Spotify desktop playing):
      - `src/util/spclient.ts` new: proto loader, `ourDeviceId`/`connectionId`
        persisted in conf, `spFetch` (auto `refreshTokens()` + retry on 401),
        observer PUT → `Cluster` decode (`putState`), `mapCluster` → clean
        `ClusterInfo`, `fetchTrack` (extended-metadata `TRACK_V4`, cached —
        cluster metadata has no artist name).
      - `Player.tsx` rewired: poll = one observer PUT every 5s; devices +
        active player state from the same cluster; position interpolated
        locally every 500ms (`interpolate()`); artist enriched async per
        track change. `PlayerStore` shape stable (fields only added).
      - Live-validated facts are in port doc §1/§5 (cluster layout, snake_case
        metadata keys, volume 0..65535, `COUNTRY = 'AU'` accepted, Any via
        `type_url`/`value`).
      - `Home.tsx`: old Web API `getMyTopArtists` threw a 429 that killed the
        whole TUI at boot — now degrades to a dim message until Phase E ports
        it (full port still Phase E).
      - Smoke-tested in a real pty: player bar, progress bar, Devices list
        all render.
- [x] **Phase B — commands** (2026-10-17, validated live with Spotify desktop
      running):
      - `spclient.ts`: `sendPlayerCommand(target, command)` — full spotatui
        envelope (`command_id`, `logging_params`, merged `options`,
        `connection_type: wlan`); `playCommand` (context + skip_to
        track_index/track_uri) and `playTracksCommand` (track list via
        context.pages) builders; `transferPlayback(from, to)` with
        camelCase-first body and a remembered fallback to snake_case.
      - `Player.tsx`: `playPause` = fresh poll then pause/resume command +
        optimistic flip; `selectDevice` = transfer (from = current active or
        target) then poll; `play(context_uri, {uris?, offset?})` maps to
        playCommand/playTracksCommand. The old `spotify-web-api-node` calls
        are gone from the store.
      - Live-validated (port doc §2/§3): resume/pause/play all move real
        playback; semantic errors return 403 JSON `{error_code,
        error_description, reasons}`; transfer camelCase body → 200 + `ack_id`
        (open question 2 settled).
      - pty smoke: space-key playPause doesn't crash the TUI.

### TODO — in order; each phase leaves the app runnable
- [ ] **Phase C — search**: `src/util/pathfinder.ts`, hash table + 412
      rotation; adapt `src/view/Search.tsx` to wrapper shape. (Port doc §4 —
      note: answer shape is `data.searchV2.tracksV2.items[].item.data`, not
      `items[].data` — verified live 2026-10-17; fix this in port doc §4 when
      adapting.)
- [ ] **Phase D — album/artist views**: extended-metadata batching; Album via
      discs→tracks + `coverGroup` image URLs for `get-image-colors`; Artist via
      album groups. (`fetchTrack` in `spclient.ts` is the pattern — reuse it.)
- [ ] **Phase E — home**: followed artists via `collection/v2/paging`
      (username problem — port doc §7) or Made-For-You `browsePage`.
- [ ] **Phase F — cleanup**: remove `spotify-web-api-node`, `@types/spotify-api`,
      `@types/spotify-web-api-node`, Web API types in `src/util/spotify.ts`;
      README; final commit.

## Open questions (settle during the phase they block, write answers back here)
1. ~~Username for `collection/v2/paging`~~ (Phase E) — options in port doc;
   live hint: `context_metadata.context_owner` is a numeric id, not a username.
2. ~~Transfer body casing~~ settled (2026-10-17, validated live): camelCase
   `{"transferOptions": {"restorePaused": "resume"}}` → HTTP 200 + `ack_id`;
   snake_case never needed (kept only as a fallback path in `transferPlayback`).
3. ~~Country code for extended-metadata header~~ settled: static `AU` works
   (validated live; `COUNTRY` in `spclient.ts`).
4. Pathfinder hash rotation is expected over time; refresh from spotatui
   `search.rs` when all hashes 412.

## Hard-won testing notes (don't rediscover these)
- react-curse renders **nothing at terminal size 0×0** — pty tests must set the
  window size before spawn; no-TTY pipes crash in its screen buffer.
- `api.spotify.com` 429 for our client is **permanent, not volume-based**.
- Access token ~1h → `refreshTokens()` before any API work.
- Log first when debugging: `~/Library/Logs/spoty-nodejs/spoty.log`.
- Tokens: `~/Library/Preferences/spoty-nodejs/config.json` (conf key `tokens`).

## Decision log
- 2026-10-17: keep Spotify desktop as the Connect player (no native streaming,
  no librespot session) — spoty stays a remote; only auth + endpoints ported.
- 2026-10-17: `proto/` vendored wholesale-transitive (10 files) rather than
  hand-picking messages; loads verified once, listed in port doc.
- 2026-10-17: keep `PlayerStore` shape stable during port so views don't churn.
- 2026-10-17 (Phase A): one observer PUT is the poll — devices + player state
  from a single request every 5s; position interpolated locally at 500ms.
- 2026-10-17 (Phase A): artist name is NOT in connect-state track metadata —
  resolved per track via extended-metadata `TRACK_V4` (cached in-memory);
  `album_title`/`album_uri` come straight from the cluster.
- 2026-10-17 (Phase A): Home degrades to a dim message instead of throwing
  (its `getMyTopArtists` 429 was killing the TUI at boot); full port in Phase E.
- 2026-10-17 (Phase A): observer device identity (`ourDeviceId`,
  `connectionId`) persisted in conf via `storage.ts`.
- 2026-10-17 (Phase B): command envelope exactly as spotatui's, with the
  envelope `options` merged into the play command's own `options` (not
  clobbered) — accepted live.
- 2026-10-17 (Phase B): 403 JSON replies (`pause_restricted` etc.) are
  semantic errors, not auth failures — log them, don't back off like 429.
- 2026-10-17 (Phase B): transfer body camelCase settled live; snake_case kept
  as remembered-fallback only.
