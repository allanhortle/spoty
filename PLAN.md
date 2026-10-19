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

## Status: Port complete (Phases A–F) — 2026-10-18

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
- [x] **Phase C — search** (2026-10-18, validated live through the TUI in a pty):
      - `src/util/pathfinder.ts` (committed in `92cb599`): `pathfinderQuery` with
      the hash table + HTTP-412 rotation (`searchDesktop` fallback + per-type
      hashes), `searchArtists` (field `artists`, flat items, name at
      `data.profile.name`) and `searchAlbums` (field `albumsV2`, flat items,
      artist names at `data.artists.items[].profile.name`).
      - `Search.tsx` rewired to `searchArtists`/`searchAlbums`; errors degrade to
      a dim message (don't kill the TUI); free-text only (Web API field filters
      gone). Answer shape from port doc §4 confirmed live again today.
      - Live validation: direct node test (Radiohead → 5 artists incl. correct
      uri; In Rainbows → 5 albums with artist names) + pty smoke test with both
      rounds (artist query, tab, album query) rendering results.
- [x] **Phase D — album/artist views** (2026-10-18, validated live, pty
      smoke passed end-to-end):
      - `spclient.ts`: `extendedMetadata()` shared batch helper (any number of
      `{entityUri, extensionKind}` in ONE POST); `gidToId`/`idToGid`
      (16-byte gid ↔ 22-char base62, validated against search uris);
      `fetchAlbum` (ALBUM_V4 → gid-only disc tracks → batch TRACK_V4 →
      full tracks + cover from the track's embedded album `coverGroup`);
      `fetchArtist` (ARTIST_V4 → gid-only groups → batch ALBUM_V4 → name/year/
      track count). All cached in-memory.
      - **Port doc §5 corrected** (live-validated): ALBUM_V4 disc tracks and
      ARTIST_V4 groups are **gid-only**; toJSON keys are camelCase
      (`albumGroup`, not `album_group`); cover URL is `https://i.scdn.co/image/
      <hex of fileId bytes>` (raw base64 404s); the cover lives on the
      **track's** embedded album, not ALBUM_V4 (which has no coverGroup).
      - `Album.tsx`/`Artist.tsx` rewired to `fetchAlbum`/`fetchArtist` with
      feature-filtering via album-artist gids; errors degrade to a dim
      message (was `throw`); the old `spotify-web-api-node` calls are gone
      from both views.
      - pty smoke: artist view (Radiohead, 15 albums + 32 singles, Albums/
      Singles labels at the right rows) → down×6 → Enter on In Rainbows →
      album view renders with **true-color cover colors** (getColors on the
      hex URL) and the full track list with correct durations; direct
      album boot also renders.
- [x] **Phase E — home** (2026-10-18, validated live + pty smoke passed):
      - `spclient.ts`: `fetchFollowedArtists()` — `POST /collection/v2/paging/`
      (trailing slash required, no-slash 404s) with PageRequest
      `{username: 'me', set: 'artist', paginationToken: '', limit: 300}` →
      183 followed artists in ONE page; uri-only items → names via one
      batched ARTIST_V4 POST.
      - **Open question 1 closed (live)**: `username` can be ANY non-empty
      string — the server identifies the user from the token ('bogus' →
      our own artists; empty → 500; the numeric `context_owner` hint was a
      red herring). Port doc §7 updated.
      - `Home.tsx`: shows the Followed Artists list (the old Web API
      "top artists short/medium/long" isn't reachable from spclient with
      known operations — followed artists is the closest port).
      - pty smoke: Home renders the 183-artist list; Enter drills into the
      artist view with Albums/Singles all correct.
      - 2026-10-18 (follow-up): Home is now **three ListTable columns** again
      (restoring the pre-port layout): On Repeat / daylist / Repeat Rewind,
      the Made-For-You auto-playlists (port doc §9 — no top-artists endpoint
      exists on spclient). Enter plays that playlist from the selected track.
      (`fetchFollowedArtists` stays in `spclient.ts`, unused by Home for now.)
- [x] **Phase F — cleanup** (2026-10-18): removed `spotify-web-api-node`,
      `@types/spotify-api`, `@types/spotify-web-api-node` deps; `spotify.ts` is
      now pairing/refresh only (no Web API client, no `SpotifyApi.*` types,
      no default export); README's home-screen line updated; `yarn tsc` clean;
      home + search pty smokes re-run green after the removal.

## Open questions (settle during the phase they block, write answers back here)
1. ~~Username for `collection/v2/paging`~~ settled (2026-10-18, validated live):
   ANY non-empty string works — the server identifies the user from the token
   (spoty passes `'me'`). The trailing slash on the URL was the real blocker
   (no-slash 404s). Port doc §7 has the full spec.
2. ~~Transfer body casing~~ settled (2026-10-17, validated live): camelCase
   `{"transferOptions": {"restorePaused": "resume"}}` → HTTP 200 + `ack_id`;
   snake_case never needed (kept only as a fallback path in `transferPlayback`).
3. ~~Country code for extended-metadata header~~ settled: static `AU` works
   (validated live; `COUNTRY` in `spclient.ts`).
4. Pathfinder hash rotation is expected over time; refresh from spotatui
   `search.rs` when all hashes 412.

## Hard-won testing notes (don't rediscover these)
- **Use `script`, not `expect`, for app-level pty smokes** (validated
  2026-10-19): `expect`'s pty only flushes spawned output when the process
  EXITS, and — worse — under `expect` the app's react-enty request resolves
  (`home-request-done` in the log) but the hook never re-renders (spinner
  forever), even though everything works in a real terminal. The recipe that
  works, with piped stdin for keystrokes (one char per printf, ≥1s apart):
  `{ sleep 20; printf '/'; sleep 2; printf '\r'; sleep 2; printf 'q'; } | \
    script -q /tmp/out sh -c "stty rows 30 cols 120; exec node build/index.js"`
  then decode /tmp/out (it holds ESC[?1049h + ANSI). A python reconstructor
  of the byte stream (H/C/D/G moves) gives the final screen to assert on.
  Keys: `q` pops a route; `q` on home exits (clean output flush); in Search
  the input has focus — Enter releases it before global keys work.
- react-curse renders **nothing at terminal size 0×0** — pty tests must set the
  window size before spawn; no-TTY pipes crash in its screen buffer.
  (`script` alone gives 0×0 too — set the size via the inner `sh -c stty`
  trick above; `expect`'s `exec stty < $spawn_out(slave,name)` breaks spawn
  output entirely.)
- react-curse `Input` **drops all but the first char of a multi-char stdin
  chunk** (queue-drained chunks carry no `raw` and Input's handler bails on
  `raw === undefined`) — pty tests must send **one keystroke per write**,
  not whole strings. Human typing (one key per data event) is unaffected.
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
- 2026-10-18 (Phase C): pty testing must send one keystroke per write —
  react-curse `Input` drops all but the first char of a multi-char stdin
  chunk (queue-drained chunks carry no `raw`); see hard-won testing notes.
- 2026-10-18 (Phase D): extended-metadata responses are **partial by design** —
  ALBUM_V4/ARTIST_V4 return gid-only sub-entities, so album/artist views are
  two-step: one V4 request for the skeleton, one **batched** request for every
  gid (the endpoint takes any number of entityRequests in one POST).
- 2026-10-18 (Phase D): the album cover is NOT in ALBUM_V4 — it rides on the
  track's embedded album (`Track.album.coverGroup`); URL = hex of the fileId
  bytes (base64 form 404s).
- 2026-10-18 (Phase D): Album/Artist views degrade to a dim message on fetch
  error (was `throw` — a 429 there used to kill the whole TUI).
- 2026-10-18 (Phase E): `collection/v2/paging/` needs the trailing slash, and
  `PageRequest.username` can be any non-empty string (token identifies the
  user) — the username hunt was a red herring.
- 2026-10-18 (Phase E): Home now lists followed artists (183, one page) —
  "top artists" is not reachable via spclient/pathfinder with known
  operations; `browsePage` (Made For You) stays as an unneeded alternative.
- 2026-10-18 (Phase F): `spotify.ts` is pairing + token refresh only;
  every data call now goes through `spclient.ts`/`pathfinder.ts`.
- 2026-10-18: recent/most-played stats probed live (port doc §9): no direct
  endpoint on spclient; the data lives in the Made-For-You auto-playlists
  (On Repeat / Repeat Rewind / daylist), reachable via browsePage + §6
  playlist contents — a possible future Home add-on, not a port blocker.
- 2026-10-18: Home is three ListTable columns again (like the pre-port home):
  On Repeat / daylist / Repeat Rewind (hardcoded URIs — same for every
  account, personalized per user). `fetchPlaylist` (§6, needs the `items`
  decorate) + `fetchTracks` (batched TRACK_V4, one POST for all 110) feed it;
  Enter plays that playlist from the selected track (playCommand context +
  skip_to — Phase B envelope). pty smoke: heads + parallel rows render,
  arrows navigate cells.
- 2026-10-19: Home is **album-focused**, two columns: `Recent` = albums
  aggregated from On Repeat + Repeat Rewind tracks, ranked by total
  appearances; `daylist` = albums from the daily recommendation playlist.
  `TrackInfo` now carries `albumUri`/`artistUris` (base62 from the TRACK_V4
  album/artist gids — got them for free from the existing batch decode, no
  extra requests). Row = `Album — main artist`; active row greens when
  `PlayerStore.albumUri` matches. Enter **navigates** to the album view
  (route = album uri, same as Search/Artist) instead of playing.
  Validated live: 30+30+50 tracks → 108 unique in one batched POST,
  aggregation + ranking correct (top: Sunshine — Jungle ×8); TUI confirmed
  working by the user. Note: my scripted pty smokes went flaky in the
  environment this session (spawn renders nothing, no log lines, even for
  the pre-change build) — direct `node` data tests still work; human-verify
  TUI changes if that recurs. (Superseded 2026-10-19: the flakiness was
  `expect`-specific — see hard-won testing notes; `script` smokes work.)
- 2026-10-19: **Japanese/CJK text ghosted across navigation** — react-curse's
  screen buffer is one cell per JS character, but CJK glyphs are 2 terminal
  columns wide, so after any CJK chunk the renderer's cursor model drifts
  from the physical cursor and diff updates write into the wrong columns
  (stale text persists across route changes). **No react-curse version
  handles this** (checked through 1.0.23 — `str.length` cursor math, no
  wcwidth anywhere). Fixed with `patches/react-curse+1.0.23.patch`
  (applied by `patch-package` via the `postinstall` script): buffer cells are
  physical columns now — `Screen.put` writes wide glyphs as char +
  `["", modifiers]` continuation cell (zero-width chars ride along with the
  previous cell), `Term.render` skips `""` cells when emitting and advances
  its cursor by cell span. Validated: isolated diff-update test (CJK prefix
  + changed latin tail → `ESC[1;10H` absolute positioning, `world` exactly
  over `hello`) and full app home→search→home under `script` pty (final
  screen pixel-perfect, エアにに row aligned with neighbors, no ghosts).
  **Second round same day — the span advance was still buggy and the user
  still saw corruption (ghost つ injected into `エアにに` + displaced
  fragments, then "locked" — the diff never repairs what the model thinks
  is unchanged).** Root cause: the span counted the chunk's covered cells
  (last cell + 1), but when a wide char's BASE cell changes while its
  CONTINUATION cell is unchanged (prev frame had a different wide char in
  the same spot), the chunk holds the base without the continuation and
  undercounts the physical advance by 1 per such wide char. Reproduced via
  Home → Enter into the エアにに album (CJK tracks) → play → q → Home: the
  home diff against the album view's CJK track row split the CJK run
  (`エアに` chunk span 9 vs physical 10; next `に` intended x=10, landed 11).
  **Fix: span = chunk start + SUM OF DISPLAY WIDTHS** (`charWidth(char)`
  per base cell, 0 for `""` continuations) — `
  chunks[chunksAt][2] = (chunks[chunksAt][2] ?? x) + (char === "" ? 0 : charWidth(char))`.
  Diagnosis technique (reusable): instrument `Term.render` to log every
  chunk (intended x/y/str) + the buffer per frame to a file, replay the pty
  byte stream with a WIDTH-AWARE terminal simulator (a 1-col/char
  simulator gives false positives AND false negatives — burned an hour on
  that), then find the first chunk whose landing ≠ intended. Both flows
  re-validated byte-identical to the model, zero ghost cells.
- 2026-10-19: react-curse upgraded 1.0.13 → 1.0.23 (last is 2025-10-16,
  public `.d.ts` identical). It requires react ^19 + react-reconciler ^0.32
  (bundled) — `react` is a transitive dep for us (src only imports `react`),
  so the lock moved react 18.2 → 19.3.1; `src` never imports
  `react-dom`/`react-reconciler` directly and `yarn tsc` is clean. Verified
  under React 19: react-enty `createRequestHook` (isolated pty test), valtio
  player polling, and the full app smoke. The `@types/react@18` / unused
  `react-dom@18` leftovers in package.json are harmless (tsc clean) —
  tidy up if ever bored.
