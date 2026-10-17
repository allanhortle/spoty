# AGENTS.md — spoty

A Spotify TUI (React 18 + `react-curse` + valtio + react-enty), TypeScript,
compiled with `tsc` to `build/`, ESM, Node 24.

## Read this first: `docs/spotify-port.md`

The project is mid-port from Spotify's dead public Web API to Spotify's
**internal endpoints** (`spclient.wg.spotify.com` + pathfinder), using
spotatui's first-party auth (device pairing against Spotify's desktop client
ID). **All endpoint specs, protobuf payloads, persisted query hashes, and the
phased plan live in `docs/spotify-port.md` — use it, don't re-derive.**

Context-economy rules (a previous session burned its whole budget re-reading
this material):

- **Do not** clone/read spotatui or spotatui-librespot, or read the old pi
  session logs, to "figure out how it works" — it's already in the port doc.
- **Do not** cat/dump `.proto` files or large reference files into context.
  The protos are vendored in `proto/` and load with `protobufjs` at runtime;
  message names are listed in the port doc.
- If you need a fact that's missing from the port doc, use targeted `grep`
  (specific line ranges), capture the answer, and **write it into the port
  doc** so the next session doesn't repeat it.
- Keep tool output small: `head`, `wc`, `grep -c` over `cat`.

## Build / run

```bash
yarn install        # yarn 1 (classic), lockfile v1
yarn build          # tsc -> build/
node build/index.js # run it (fnm picks Node 24 via .node-version)
```

- No test suite exists yet; smoke-test by running under a **pty with a real
  window size** (react-curse renders nothing at 0×0 — see port doc testing notes).
- Spotify desktop must be running for playback tests.

## Runtime locations

- Tokens (conf): `~/Library/Preferences/spoty-nodejs/config.json`, key `tokens`.
  Access token ~1h; call `refreshTokens()` (`src/util/spotify.ts`) before API work.
- Log: `~/Library/Logs/spoty-nodejs/spoty.log` (winston json) — check it first
  when something fails; the old UI mislabeled errors, so trust the log.

## Hard constraints

- **`api.spotify.com` is permanently 429 for our client ID** — never add calls
  to it (this includes everything through `spotify-web-api-node`; it is being
  removed once the port finishes).
- Auth is the OAuth device pairing flow against client ID
  `65b708073fc0480ea92a077233ca87bd` — never reintroduce PKCE/hono/redirect
  URIs; the whole point is no developer app and no callback server.
- Scopes must all be grantable to that client ID or Spotify fails the whole
  request with `invalid_scope`; current grantable set is in the port doc.
- Keep `PlayerStore`'s shape stable while porting so views don't churn.
- Using Spotify's internal client ID is unofficial (same ToS posture as
  spotatui/librespot) — fine for personal use.

## Code style

- 4-space indent, single quotes, semicolons (matches existing files;
  prettier config is in the repo).
- Views are `.tsx` under `src/view/`, non-React modules are `.ts` under
  `src/util/` / `src/handler/`.
- Errors: log via `src/util/logger.ts`, surface human-readable messages in the
  UI (never `[object Object]` — see `src/handler/fetchTokens.tsx` for the pattern).
