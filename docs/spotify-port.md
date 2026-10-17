# The spclient port — plan and validated reference

Everything in this file was **validated live** (or captured verbatim from spotatui /
spotatui-librespot source) during the 2026-10-17 session. **Do not re-derive it**
from the spotatui repos, session logs, or by dumping `.proto` files into context.
If a detail here is wrong, fix it here after validating.

## Why we're doing this

Spotify (Nov 2025) blanket-restricts the public Web API (`api.spotify.com`) per
developer app. spoty's old dev-app + PKCE login is dead. We switched auth to
**spotatui's approach**: OAuth *device pairing* against Spotify's own desktop
client ID, which yields **first-party** tokens.

**But `api.spotify.com` also blanket-429s the first-party client ID** (its shared
quota is permanently saturated by every librespot-based tool on earth — a single
cold request to `/v1/me` returns 429). This is why spotatui never touches the
public Web API. **Conclusion: every API call must move to Spotify's internal
endpoints** — `spclient.wg.spotify.com` + `api-partner.spotify.com` (pathfinder).

## Current state of the working tree (uncommitted)

Done and working:
- Node 24 (`.node-version`, `engines`, `@types/node`), `yarn tsc` clean.
- **Auth**: device pairing flow in `src/util/spotify.ts`
  (`requestPairingCode()` / `pollForPairing()` / `refreshTokens()`).
  Client ID `65b708073fc0480ea92a077233ca87bd` (Spotify desktop / librespot
  keymaster). Dead refresh token → storage cleared, app falls back to pairing.
  The hono callback server, `hono`/`@hono/node-server` deps, and PKCE helpers
  are **gone**. Login was tested end-to-end; token carries every scope we need
  (streaming, `user-modify-playback-state`, `playlist-read-private`, `user-top-read`, …).
- `protobufjs` dependency added; **`proto/` vendored** (10 files, 56K) from
  spotatui-librespot's `protocol/proto`. Verified to load and every message we
  need resolves (names below).
- Token storage (conf): `~/Library/Preferences/spoty-nodejs/config.json`, key
  `tokens` (`{access_token, refresh_token, expires_in, scope, token_type}`).
  Access token expires in ~1h — always `refreshTokens()` before API work.
- Log: `~/Library/Logs/spoty-nodejs/spoty.log` (winston, json).

Broken (still on `api.spotify.com` → permanent 429): everything that goes
through `spotify-web-api-node` — player state polling, devices, play/pause,
search, album, artist, home (`getMyTopArtists`). `src/view/Player.tsx` polls
every 3s with backoff (the poll itself must move to spclient).

## Validated endpoints (base: `https://spclient.wg.spotify.com`)

All requests: `Authorization: Bearer <oauth token>` (the pairing/refresh token —
no login5 or client-token needed; confirmed live).

### 1. Playback state — observer PUT (validated live, 200)
`PUT /connect-state/v1/devices/{ourDeviceId}`
- Headers: `Content-Type: application/x-protobuf`,
  `x-spotify-connection-id: <any random hex>` (a random connection id was
  accepted — no Mercury dealer needed).
- Body: protobuf `spotify.connectstate.PutStateRequest`:
  ```
  memberType: CONNECT_STATE, putStateReason: NEW_DEVICE,
  clientSideTimestamp: Date.now(),
  device: {deviceInfo: {
    deviceId: <random 40-hex>, name: "spoty",
    clientId: "65b708073fc0480ea92a077233ca87bd",
    deviceType: COMPUTER,
    capabilities: {canBePlayer: false, hidden: true, isObservable: true,
      supportsCommandRequest: true, supportsTransferCommand: true,
      supportsGzipPushes: true, commandAcks: true}}}
  ```
- **Response body = full `spotify.connectstate.Cluster`** (protobuf):
  `activeDeviceId`, `playerState` (**top-level Cluster field 3**),
  `device` **map of id → DeviceInfo directly** (no Device wrapper),
  DeviceInfo = `{name, deviceType, deviceId, volume…}`
  PlayerState = `{isPaused, positionAsOfTimestamp, duration, contextUri,
  track.metadata[…], nextTracks, …}`.
  Validated live: returned the real cluster (`studio`, `MacBook Pro`, `Marantz NR1509`).
- **Volume is 0..65535** (validated live: raw 16384 = 25% — divide by 65535 for a
  percent).
- **PlayerState.track.metadata keys are snake_case** (validated live):
  `title`, `album_title`, `album_uri`, `artist_uri`, `context_uri`, `entity_uri`,
  `image_*_url`, `view_index` — **there is NO artist name key**; resolve artist
  names via extended-metadata TRACK_V4 (see `fetchTrack` in `src/util/spclient.ts`;
  snake_case NOT dot-case — `album.title`/`artist.name` do not exist).
- Poll cadence: every ~5s is fine; interpolate position locally between polls
  using `positionAsOfTimestamp + (now - timestamp)` while not paused.
- Persist one `ourDeviceId` + `connectionId` for the process (or in conf) and
  reuse them; keep the reason `NEW_DEVICE` on first PUT per process.

### 2. Playback commands — JSON POST (VALIDATED LIVE, 200, 2026-10-17)
`POST /connect-state/v1/player/command/from/{ourDeviceId}/to/{targetDeviceId}`
- Headers: `Content-Type: application/json`, `x-spotify-connection-id`.
- Envelope (spotatui `send_player_command`) — accepted live exactly as below
  (resume / pause / play-with-track_index all worked, implementation in
  `sendPlayerCommand` in `src/util/spclient.ts`):
  ```json
  {"command": <command>, "connection_type": "wlan", "intent_id": "<commandId>"}
  ```
  `commandId` = 32 hex chars of `(BigInt(Date.now()) << 64n | random64bit)`.
  The client adds into `command`:
  `options: {override_restrictions: false, only_for_local_device: false, system_initiated: false}`
  (for `play`, merge these INTO the existing options object that already has
  license/skip_to/player_options_override) and
  `logging_params: {command_initiated_time: now, command_received_time: now,
  page_instance_ids: [], interaction_ids: [], device_identifier: ourDeviceId, command_id: commandId}`.
- Semantic errors come back as **HTTP 403 with JSON**
  `{error_code, error_description, reasons[]}` (e.g. `pause_restricted` /
  `["already_paused"]` when pausing a paused device) — treat as info, not crash.
- Command vocabulary (verbatim from spotatui `player.rs`; resume/pause/play
  validated live, rest source-verified):
  - play: `{"endpoint": "play", "context": {"uri": ctx, "url": "context://" + ctx, "metadata": {}},
    "play_origin": {"feature_identifier": "spoty", "feature_version": "1.4.1"},
    "options": {"license": "premium", "skip_to": {"track_uri": uri} | {"track_index": n} | {}, "player_options_override": {}}}`
    (for a track list instead of context: `context = {"uri": "", "url": "", "metadata": {}, "pages": [{"tracks": [{"uri": uri}, …]}]}`)
  - resume: `{"endpoint": "resume"}`
  - pause: `{"endpoint": "pause"}` (generic `{"endpoint": <name>}` shape)
  - seek: `{"endpoint": "seek_to", "value": positionMs, "position": positionMs}`
  - shuffle: `{"endpoint": "set_shuffling_context", "value": bool}`
  - repeat: `{"endpoint": "set_repeating_context"|"set_repeating_track", "value": …}`
  - queue: `{"endpoint": "add_to_queue", "track": {"uri": uri, "metadata": {"is_queued": "true"}, "provider": "queue"}}`

### 3. Device transfer — JSON POST (VALIDATED LIVE, 200, 2026-10-17)
`POST /connect-state/v1/connect/transfer/from/{fromDeviceId}/to/{toDeviceId}`
  - `from` = `cluster.activeDeviceId`, or the target itself if nothing is active.
  - **Body casing settled (open question 2): camelCase works** —
    `{"transferOptions": {"restorePaused": "resume"}}` returned HTTP 200 with
    `{"ack_id": "…"}` (validated live via a self-transfer, active→active; a real
    cross-device transfer uses the same envelope, validated in normal use).
  - Headers: at least `Authorization`; `x-spotify-connection-id` (spFetch adds it).

### 4. Search — pathfinder (validated live, 200)
`POST https://api-partner.spotify.com/pathfinder/v2/query`
- Headers: `Content-Type: application/json;charset=UTF-8`, `Accept: application/json`,
  `Authorization: Bearer <token>`, `app-platform: Win32_x86_64`,
  `spotify-app-version: 1.2.52.442`.
- Body:
  ```json
  {"variables": {"searchTerm": term, "offset": 0, "limit": 20,
     "numberOfTopResults": 5, "includeAudiobooks": false,
     "includeArtistHasConcertsField": false, "includePreReleases": false,
     "includeLocalConcertsField": false, "includeAuthors": false},
   "operationName": "<op>",
   "extensions": {"persistedQuery": {"version": 1, "sha256Hash": "<hash>"}}}
  ```
- Persisted hashes (newest first; a retired hash answers **HTTP 412**, rotate to
  the next — spotatui caches the working index in an atomic):
  - `searchDesktop` (fallback, every type in one answer):
    `eef7cc54888d91bdd6802623477873caa3948ae173a0c34fd86827b267e94c03`,
    `fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c`,
    `3c9d3f60dac5dea3876b6db3f534192b1c1d90032c4233c1bbaba526db41eb31`,
    `4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49`
  - `searchTracks`: `b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751`
  - `searchArtists`: `7bf95d754fdbe32c8b161fbbe54d1ae50974900df4dce4c8f1afcbcad153224d`
  - `searchAlbums`: `202cb3305e31e5a0767ba7925f28bd728cf8f8b0217e6da43909056071cd70e9`
  - `searchPlaylists`: `d520014e748f9ea44f7707d8df1819867ac1205e8b7f3e28f22fe5fc858921b1`
  - `searchPodcasts`: `0195d9f61b43606d490bca64c3456e3593528cea6cc05c7e822c7c42beed0f4e`
- Answer (ALL VERIFIED LIVE 2026-10-17; the per-type field names and wrapper
  depth differ per type — surprising but consistent):
  - `searchArtists` → `data.searchV2.artists.items[]` = `{__typename, data}`
    **flat** (no `.item`): `data.uri`, `data.profile.name`. The field is
    `artists`, NOT `artistsV2`.
  - `searchAlbums` → `data.searchV2.albumsV2.items[]` = `{__typename, data}`
    **flat**: `data.uri`, `data.name`, `data.artists.items[].profile.name`.
  - `searchTracks` → `data.searchV2.tracksV2.items[]` = `{item: {data: …},
    matchedFields}` — **extra `.item` level** only this type has:
    `items[i].item.data.uri/.name/.albumOfTrack/.artists…`.
  - `searchArtists`/`searchAlbums`/`searchTracks` hashes all answered 200
    first-try (2026-10-17); 412 rotation is implemented in
    `src/util/pathfinder.ts` but not yet exercised live.
  So: per item use `items[i].data` (unwrap `.item` first for tracks).
  Note: free-text search only (drop Web API `field:"x"` filters).
- Validated live with the plain OAuth token (no login5/client-token dance).

### 5. Album / Artist / Track metadata — extended-metadata (VALIDATED LIVE, 200, 2026-10-17)
`POST /extended-metadata/v0/extended-metadata`
- Headers: `Content-Type: application/x-protobuf` (Accept likewise).
- Body: protobuf `spotify.extendedmetadata.BatchedEntityRequest`:
  `header: {country: <2-letter>, catalogue: "premium"}`, `entityRequest: [{entityUri,
  query: [{extensionKind}]}]`. Kinds: `ARTIST_V4 = 8`, `ALBUM_V4 = 9`, `TRACK_V4 = 10`.
- **Validated live**: `country: 'AU'` static is accepted (open question 3 settled:
  use a static country, `COUNTRY = 'AU'` in `src/util/spclient.ts`). Response
  decodes as documented; the `google.protobuf.Any` payload is accessed on the
  **raw decoded message via snake_case `type_url`/`value`** (NOT `typeUrl` —
  verified live, `typeUrl` is undefined), and `value` is the encoded
  `spotify.metadata.<Artist|Album|Track>` bytes.
- Response `BatchedExtensionResponse.extendedMetadata[].extensionData[]`:
  each has `entityUri` + `extensionData` (a `google.protobuf.Any`) → decode as
  `spotify.metadata.Artist|Album|Track`.
- `spotify.metadata.Track` (validated live): `name`, `artist[]` → `artist.name`
  (camelCase as usual — only the Any fields keep snake_case), `album.name`,
  `duration` (ms), `discNumber`.
- Album view: `spotify.metadata.Album` → `discs[].tracks[]` for the track list,
  `coverGroup.images[].imageId` → cover URL `https://i.scdn.co/image/{imageId}`
  (this is what `get-image-colors` needs in `src/view/Album.tsx`).
- Artist view: `spotify.metadata.Artist` → `albums/singles/compilations`
  (`AlbumGroup` with `items[]`).

### 6. Playlist contents (validated live, 200, plain JSON)
`GET /playlist/v2/playlist/{id}?decorate=revision,attributes,length,owner`

### 7. Library / followed artists (source-verified; blocked on username — see open questions)
`POST /collection/v2/paging` (batch)
- Headers: `Content-Type: application/vnd.collection-v2.spotify.proto` (both
  Content-Type **and** Accept in spotatui).
- Body: protobuf `spotify.collection.proto.v2.PageRequest`
  `{username, set, paginationToken: "", limit: 300}`.
  Sets: `collection` (track/album), `artist` (followed artists), `show`, `listenlater`.
- Response: `spotify.collection.proto.v2.PageResponse` → `items[]
  {uri, addedAt, isRemoved}` (+ pagination token). Cap pagination at ~200 pages.
- Home alternative that needs **no username**: pathfinder `browsePage`
  (`variables: {uri: "spotify:page:0JQ5DAt0tbjZptfcdMSKl3" (Made For You),
  pagePagination/sectionPagination {offset, limit}, browseEndUserIntegration:
  "INTEGRATION_WEB_PLAYER", includeEpisodeContentRatingsV2: false}`), hash
  `f5c4e6d668f5716464a231c1cc8b22c1cbf6ad68b09929fd7de813a30581298b`.

### 8. Lyrics (nice-to-have)
`GET /color-lyrics/v2/track/{trackId}?format=json&vocalRemoval=false&market=from_token`

## Vendored protobufs (`proto/`, loads via `protobufjs` — verified)

`connect.proto, player.proto, devices.proto, media.proto, metadata.proto,
extended_metadata.proto, extension_kind.proto, entity_extension_data.proto,
collection2v2.proto, google/protobuf/any.proto`

Message names (note collection lives under `spotify.collection.proto.v2`, not
`spotify.collection2v2`):
- `spotify.connectstate.{PutStateRequest, Cluster, PlayerState, DeviceInfo,
  TransferRequest? — NOT vendored; transfer body is plain JSON, see §3}`
- `spotify.metadata.{Artist, Album, Track}`
- `spotify.extendedmetadata.{BatchedEntityRequest, BatchedExtensionResponse}`
- `spotify.collection.proto.v2.{PageRequest, PageResponse, CollectionItem}`

Load once at startup: `protobuf.load(fs.readdirSync('proto', {recursive: true})
.filter(f => f.endsWith('.proto'))`.

## Port plan (do in this order; each phase leaves the app runnable)

> Live status/checklist lives in **`PLAN.md`** — keep progress there, this
> section is just the shape of the work.

- **Phase A — player state + devices** (`src/util/spclient.ts` new):
  base fetch helper (auto `refreshTokens()` on 401, retry once), observer PUT +
  Cluster decode, replace `PlayerStore.pollCurrentlyPlaying`/`fetchDevices` in
  `src/view/Player.tsx`. Map Cluster → existing PlayerStore fields so views
  don't change. Local position interpolation between polls.
- **Phase B — commands**: play/pause/seek/transfer envelope helpers (§2, §3);
  validate live with Spotify desktop running. Replace
  `PlayerStore.{play,playPause,selectDevice}`.
- **Phase C — search**: `src/util/pathfinder.ts` with the hash table + 412
  rotation; adapt `src/view/Search.tsx` to the wrapper shape (per-type queries,
  `searchDesktop` fallback).
- **Phase D — album/artist views**: extended-metadata batching (§5); adapt
  `Album.tsx` (discs → track rows, coverGroup → i.scdn.co URL for
  `get-image-colors`) and `Artist.tsx` (album groups).
- **Phase E — home**: followed artists via `collection/v2/paging` (needs the
  username, see open questions) or Made-For-You `browsePage` (no username).
- **Phase F — cleanup**: delete `spotify-web-api-node`, `@types/spotify-api`,
  `@types/spotify-web-api-node` deps and the `api` object + Web API types in
  `src/util/spotify.ts`; README; commit.

## Open questions

1. **Username for `collection/v2/paging`** (Phase E). spotatui gets it from its
   librespot login5 session; we only have OAuth (token response has no
   username). Options, in order: (a) try `username: "me"`, (b) use the
   no-username `browsePage` route for Home instead, (c) ask the user once at
   pairing and store in conf.
   NOTE (validated live 2026-10-17): `context_metadata.context_owner` in a
   connect-state cluster carried a numeric id (`"1231127656"`) — not a username;
   option (c) or the username-less `browsePage` remain the way.
2. ~~Transfer body casing~~ settled (2026-10-17, validated live): camelCase
   `{"transferOptions": {"restorePaused": "resume"}}` → HTTP 200 + `ack_id`;
   snake_case never needed (kept only as a fallback path in `transferPlayback`).
3. **Country code for extended-metadata header**: SETTLED (validated live
   2026-10-17) — a static `country: 'AU'` is accepted with HTTP 200. Hardcoded
   as `COUNTRY = 'AU'` in `src/util/spclient.ts`; promote to a conf setting if
   it ever matters.
4. Pathfinder hash rotation is real (they rotate "every few months") — build the
   412 rotation in from day one, and when all hashes die, refresh from
   spotatui's `search.rs` (they keep it current).

## Testing notes (from hard-won experience)

- react-curse renders nothing if the terminal has size 0×0 — testing under
  `expect`/pty requires setting the window size before spawn. A no-TTY pipe
  crashes in `react-curse`'s screen buffer on every Node version.
- Spotify desktop must be running for playback-state/command validation.
- 429s from `api.spotify.com` for the first-party client are **permanent**,
  not volume-based — if you see one, the call is on the wrong host.
- Auth pairing is cheap to test: `requestPairingCode()` issues codes without
  any credentials; `invalid_scope` fails the whole request, so scopes must all
  be grantable (ours are — verified).
