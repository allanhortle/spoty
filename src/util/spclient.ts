import protobuf from 'protobufjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import storage from './storage.js';
import {clientId, refreshTokens} from './spotify.js';
export const SPCLIENT_BASE = 'https://spclient.wg.spotify.com';

// ── protobufs ──────────────────────────────────────────────────────────────
// Vendored in <repo>/proto/. From build/util/ (or src/util/) that is ../../proto.
const protoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../proto');

const protoFiles = fs
    .readdirSync(protoDir, {recursive: true})
    .map((file) => path.join(protoDir, file.toString()))
    .filter((file) => file.endsWith('.proto'));

// Load once; every spclient call awaits this (protobuf.load caches internally
// is not a thing — we keep the promise so it only parses once).
export const protos = protobuf.load(protoFiles);

// ── our observer device identity (persisted in conf) ────────────────────────
export function ourDeviceId(): string {
    let id = storage.get('ourDeviceId');
    if (!id) {
        id = crypto.randomBytes(20).toString('hex'); // 40 hex chars, spotatui-style
        storage.set('ourDeviceId', id);
    }
    return id;
}

function connectionId(): string {
    let id = storage.get('connectionId');
    if (!id) {
        id = crypto.randomBytes(16).toString('hex');
        storage.set('connectionId', id);
    }
    return id;
}

// ── errors ──────────────────────────────────────────────────────────────────
export class SpError extends Error {
    statusCode: number;
    body: string;

    constructor(statusCode: number, body: string, url: string) {
        super(`spclient ${url} failed: HTTP ${statusCode}${body ? ` — ${body.slice(0, 300)}` : ''}`);
        this.statusCode = statusCode;
        this.body = body;
    }
}

// ── base fetch: bearer token, auto-refresh once on 401 ──────────────────────
// fetchUrl takes an absolute URL; spFetch prefixes the spclient base.
export async function fetchUrl(url: string, init: RequestInit = {}): Promise<Response> {
    const request = () => {
        const {access_token} = storage.get('tokens');
        return fetch(url, {
            ...init,
            headers: {
                Authorization: `Bearer ${access_token}`,
                'x-spotify-connection-id': connectionId(),
                ...((init.headers as Record<string, string>) ?? {})
            }
        });
    };

    let response = await request();
    if (response.status === 401) {
        // Access tokens last ~1h; refresh and retry exactly once.
        await refreshTokens();
        response = await request();
    }
    return response;
}

export async function spFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
    return fetchUrl(SPCLIENT_BASE + pathname, init);
}

// ── cluster: observer PUT → full spotify.connectstate.Cluster ───────────────
export async function putState(): Promise<protobuf.Message> {
    const root = await protos;
    const PutStateRequest = root.lookupType('spotify.connectstate.PutStateRequest');
    const Cluster = root.lookupType('spotify.connectstate.Cluster');

    const payload = PutStateRequest.create({
        memberType: 2, // CONNECT_STATE
        putStateReason: 3, // NEW_DEVICE
        clientSideTimestamp: Date.now(),
        device: {
            deviceInfo: {
                deviceId: ourDeviceId(),
                name: 'spoty',
                clientId,
                deviceType: 1, // COMPUTER
                capabilities: {
                    canBePlayer: false,
                    hidden: true,
                    isObservable: true,
                    supportsCommandRequest: true,
                    supportsTransferCommand: true,
                    supportsGzipPushes: true,
                    commandAcks: true
                }
            }
        }
    });

    const url = `/connect-state/v1/devices/${ourDeviceId()}`;
    const response = await spFetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/x-protobuf'},
        body: PutStateRequest.encode(payload).finish()
    });
    if (!response.ok) {
        throw new SpError(response.status, await response.text(), url);
    }
    return Cluster.decode(new Uint8Array(await response.arrayBuffer()));
}

// int64 fields decode as protobufjs Long objects; coerce them to numbers.
function num(value: unknown): number {
    if (typeof value === 'number') return value;
    const asLong = value as {toNumber?: (unsigned?: boolean) => number} | null;
    if (asLong && typeof asLong.toNumber === 'function') return asLong.toNumber();
    if (typeof value === 'string') return Number(value) || 0;
    return 0;
}

export type ClusterInfo = {
    activeDeviceId: string | null;
    devices: {id: string; name: string; volume: number}[];
    playerState: {
        isPaused: boolean;
        isBuffering: boolean;
        positionMs: number;
        durationMs: number;
        contextUri: string;
        trackUri: string;
        metadata: Record<string, string>;
    } | null;
};

// Map a decoded Cluster into the shape PlayerStore consumes, so the view layer
// never touches protobuf. Note (validated live): Cluster.device is a map of
// id → DeviceInfo directly, and playerState is a top-level Cluster field.
export function mapCluster(cluster: protobuf.Message): ClusterInfo {
    const c = cluster as unknown as {
        activeDeviceId?: string | null;
        playerState?: {
            isPaused?: boolean;
            isBuffering?: boolean;
            positionAsOfTimestamp?: unknown;
            duration?: unknown;
            contextUri?: string;
            track?: {uri?: string; metadata?: Record<string, string>};
        } | null;
        device?: Record<string, {deviceId?: string; name?: string; volume?: number}>;
    };

    const devices = Object.values(c.device ?? {})
        .map((info) => ({
            id: info.deviceId ?? '',
            name: info.name ?? '',
            // spirc/connect volumes are 0..65535 (scale still to be verified
            // live against the desktop client — see port doc open questions).
            volume: Math.round((num(info.volume) * 100) / 65535)
        }))
        .filter((device) => device.id);

    const state = c.playerState ?? undefined;

    return {
        activeDeviceId: c.activeDeviceId ?? null,
        devices,
        playerState: state
            ? {
                  isPaused: !!state.isPaused,
                  isBuffering: !!state.isBuffering,
                  positionMs: num(state.positionAsOfTimestamp),
                  durationMs: num(state.duration),
                  contextUri: state.contextUri ?? '',
                  trackUri: state.track?.uri ?? '',
                  metadata: state.track?.metadata ?? {}
              }
            : null
    };
}

// One call = devices + active player state (a single observer PUT).
export async function fetchCluster(): Promise<ClusterInfo> {
    return mapCluster(await putState());
}

// ── extended-metadata: track enrichment ──────────────────────────────────
// connect-state track metadata has snake_case keys (title, album_title,
// album_uri, artist_uri) but NO artist name — resolve it via TRACK_V4
// extended-metadata (validated live, 200). The google.protobuf.Any payload
// exposes type_url/value in snake_case even on camelCase-decoded messages.
const COUNTRY = 'AU'; // static for now — port doc open question 3

export type TrackInfo = {
    name: string;
    artists: string[];
    albumName: string;
    albumUri: string; // spotify:album:<id> — from Track.album.gid
    artistUris: string[]; // spotify:artist:<id>[] — from Track.artist[].gid
    durationMs: number
};

const trackCache = new Map<string, TrackInfo | null>();

// TRACK_V4 toJSON → TrackInfo (shared by fetchTrack and fetchTracks).
// toJSON keeps album/artist gids base64 — convert them to base62 uris so
// consumers (e.g. album-focused Home) get playable entity uris for free.
function trackInfoFromJson(track: {
    name?: string;
    artist?: {gid?: string; name?: string}[];
    album?: {gid?: string; name?: string};
    duration?: unknown;
}): TrackInfo {
    return {
        name: track.name ?? '',
        artists: (track.artist ?? []).map((artist) => artist.name ?? '').filter(Boolean),
        albumName: track.album?.name ?? '',
        albumUri: track.album?.gid ? `spotify:album:${gidToId(track.album.gid)}` : '',
        artistUris: (track.artist ?? [])
            .filter((artist) => artist.gid)
            .map((artist) => `spotify:artist:${gidToId(artist.gid as string)}`),
        durationMs: num(track.duration)
    };
}

// One POST, any number of entity requests — the endpoint is batch by design
// (port doc §5). Each entry: {entityUri, extensionKind}.
export type EntityRequest = {entityUri: string; extensionKind: number};

export const EXTENSION_KIND = {ARTIST_V4: 8, ALBUM_V4: 9, TRACK_V4: 10} as const;

async function extendedMetadata(requests: EntityRequest[]): Promise<
    {entityUri: string; typeName: string; value: Uint8Array}[]
> {
    const root = await protos;
    const Request = root.lookupType('spotify.extendedmetadata.BatchedEntityRequest');
    const Response = root.lookupType('spotify.extendedmetadata.BatchedExtensionResponse');

    const payload = Request.create({
        header: {country: COUNTRY, catalogue: 'premium'},
        entityRequest: requests.map(({entityUri, extensionKind}) => ({
            entityUri,
            query: [{extensionKind}]
        }))
    });

    const url = '/extended-metadata/v0/extended-metadata';
    const response = await spFetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf'},
        body: Request.encode(payload).finish()
    });
    if (!response.ok) {
        throw new SpError(response.status, await response.text(), url);
    }

    const decoded = Response.decode(new Uint8Array(await response.arrayBuffer()));
    // The Any payload is accessed on the raw decoded message via snake_case
    // type_url/value (validated live — typeUrl is undefined).
    const out: {entityUri: string; typeName: string; value: Uint8Array}[] = [];
    for (const array of decoded.extendedMetadata ?? []) {
        for (const data of array.extensionData ?? []) {
            const any = data.extensionData as unknown as {type_url?: string; value?: Uint8Array};
            if (!any.value) continue;
            // type_url is like "type.googleapis.com/spotify.metadata.TrackV4" —
            // take the message name so the caller picks the decoder.
            const typeName = (any.type_url ?? '').split('/').pop() ?? '';
            out.push({entityUri: data.entityUri, typeName, value: any.value});
        }
    }
    return out;
}

export async function fetchTrack(uri: string): Promise<TrackInfo | null> {
    if (trackCache.has(uri)) return trackCache.get(uri) ?? null;

    const root = await protos;
    const Track = root.lookupType('spotify.metadata.Track');
    const [entry] = await extendedMetadata([{entityUri: uri, extensionKind: EXTENSION_KIND.TRACK_V4}]);
    if (!entry || entry.entityUri !== uri) {
        trackCache.set(uri, null);
        return null;
    }
    const info = trackInfoFromJson(Track.decode(entry.value).toJSON());
    trackCache.set(uri, info);
    return info;
}

// ── ids: 16-byte gid (base64 after toJSON) ↔ 22-char base62 id ───────────────
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gidToId(gid: string): string {
    let n = 0n;
    for (const byte of Buffer.from(gid, 'base64')) n = (n << 8n) | BigInt(byte);
    let id = '';
    while (n > 0n) {
        id = BASE62[Number(n % 62n)] + id;
        n /= 62n;
    }
    return id.padStart(22, '0');
}

export function idToGid(id: string): string {
    let n = 0n;
    for (const char of id) n = n * 62n + BigInt(BASE62.indexOf(char));
    const bytes = new Uint8Array(16);
    for (let i = 15; i >= 0; i--) {
        bytes[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return Buffer.from(bytes).toString('base64');
}

// ── album / artist metadata (port doc §5) ────────────────────────────────
// Live-validated shapes (2026-10-18): ALBUM_V4's disc tracks are **gid-only**
// and carry no coverGroup — full track data (name/artist/duration, plus the
// embedded album with coverGroup) comes from TRACK_V4; ARTIST_V4's groups are
// also gid-only, full album data from ALBUM_V4. Both views batch the second
// request in ONE extended-metadata POST. toJSON keys are camelCase (only the
// Any type_url/value stay snake_case).

export type AlbumTrack = {
    index: number; // overall position across discs (play offset)
    number: number; // printed track_number
    disc: number;
    name: string;
    artists: string[]; // features only (album artists already filtered)
    explicit: boolean;
    durationMs: number;
    uri: string;
    id: string; // base62, matches PlayerStore.id
};

export type AlbumInfo = {
    uri: string;
    name: string;
    artists: string[];
    year: number;
    tracks: AlbumTrack[];
    coverUrl: string | null; // https://i.scdn.co/image/<hex fileId> for get-image-colors
};

const albumCache = new Map<string, AlbumInfo | null>();

export async function fetchAlbum(uri: string): Promise<AlbumInfo | null> {
    if (albumCache.has(uri)) return albumCache.get(uri) ?? null;

    const root = await protos;
    const Album = root.lookupType('spotify.metadata.Album');
    const Track = root.lookupType('spotify.metadata.Track');
    const [entry] = await extendedMetadata([
        {entityUri: uri, extensionKind: EXTENSION_KIND.ALBUM_V4}
    ]);
    if (!entry || entry.entityUri !== uri) {
        albumCache.set(uri, null);
        return null;
    }
    const album = Album.decode(entry.value).toJSON() as {
        name?: string;
        artist?: {gid?: string; name?: string}[];
        date?: {year?: unknown};
        disc?: {track?: {gid?: string}[]}[];
    };

    // disc tracks are gid-only — batch TRACK_V4 for every one of them.
    const trackUris = (album.disc ?? [])
        .flatMap((disc) => (disc.track ?? []).map((track) => track.gid ?? ''))
        .filter(Boolean)
        .map((gid) => `spotify:track:${gidToId(gid)}`);
    const trackEntries = trackUris.length
        ? await extendedMetadata(
              trackUris.map((trackUri) => ({
                  entityUri: trackUri,
                  extensionKind: EXTENSION_KIND.TRACK_V4
              }))
          )
        : [];
    const trackByUri = new Map(trackEntries.map((entry) => [entry.entityUri, entry]));

    const artistGids = new Set((album.artist ?? []).map((artist) => artist.gid ?? ''));
    const tracks: AlbumTrack[] = [];
    let index = 0;
    let coverUrl: string | null = null;
    for (const trackUri of trackUris) {
        const t = trackByUri.get(trackUri);
        if (!t) continue;
        const track = Track.decode(t.value).toJSON() as {
            number?: unknown;
            discNumber?: unknown;
            name?: string;
            artist?: {gid?: string; name?: string}[];
            explicit?: unknown;
            duration?: unknown;
            album?: {coverGroup?: {image?: {fileId?: string; width?: unknown}[]}};
        };
        if (!coverUrl) {
            // The cover lives on the track's embedded album (ALBUM_V4 has
            // none). Largest image wins; the URL is the hex of the fileId
            // bytes (base64 form 404s — validated live).
            const images = (track.album?.coverGroup?.image ?? [])
                .slice()
                .sort((a, b) => num(b.width) - num(a.width));
            const fileId = images[0]?.fileId;
            if (fileId) {
                coverUrl = `https://i.scdn.co/image/${Buffer.from(fileId, 'base64').toString('hex')}`;
            }
        }
        tracks.push({
            index: index++,
            number: num(track.number),
            disc: num(track.discNumber),
            name: track.name ?? '',
            artists: (track.artist ?? [])
                .filter((artist) => artist.gid && !artistGids.has(artist.gid))
                .map((artist) => artist.name ?? '')
                .filter(Boolean),
            explicit: !!track.explicit,
            durationMs: num(track.duration),
            uri: trackUri,
            id: trackUri.slice('spotify:track:'.length)
        });
    }

    const info: AlbumInfo = {
        uri,
        name: album.name ?? '',
        artists: (album.artist ?? []).map((artist) => artist.name ?? '').filter(Boolean),
        year: num(album.date?.year),
        tracks,
        coverUrl
    };
    albumCache.set(uri, info);
    return info;
}

export type ArtistAlbum = {
    name: string;
    uri: string;
    year: number;
    trackCount: number;
    type: 'album' | 'single';
};

export type ArtistInfo = {
    uri: string;
    name: string;
    albums: ArtistAlbum[]; // albums first, then singles
    singlesStart: number;
};

const artistCache = new Map<string, ArtistInfo | null>();

export async function fetchArtist(uri: string): Promise<ArtistInfo | null> {
    if (artistCache.has(uri)) return artistCache.get(uri) ?? null;

    const root = await protos;
    const Artist = root.lookupType('spotify.metadata.Artist');
    const Album = root.lookupType('spotify.metadata.Album');
    const [entry] = await extendedMetadata([
        {entityUri: uri, extensionKind: EXTENSION_KIND.ARTIST_V4}
    ]);
    if (!entry || entry.entityUri !== uri) {
        artistCache.set(uri, null);
        return null;
    }
    const artist = Artist.decode(entry.value).toJSON() as {
        name?: string;
        albumGroup?: {album?: {gid?: string}[]}[];
        singleGroup?: {album?: {gid?: string}[]}[];
    };

    // Groups are gid-only — batch ALBUM_V4 for every album (name/year/track
    // count all come from the album payload).
    const groups: [type: 'album' | 'single', albums: {gid?: string}[]][] = [
        ['album', (artist.albumGroup ?? []).flatMap((group) => group.album ?? [])],
        ['single', (artist.singleGroup ?? []).flatMap((group) => group.album ?? [])]
    ];
    const albumUris = groups
        .flatMap(([, albums]) => albums.map((album) => album.gid ?? ''))
        .filter(Boolean)
        .map((gid) => `spotify:album:${gidToId(gid)}`);
    const albumEntries = albumUris.length
        ? await extendedMetadata(
              albumUris.map((albumUri) => ({
                  entityUri: albumUri,
                  extensionKind: EXTENSION_KIND.ALBUM_V4
              }))
          )
        : [];
    const albumByUri = new Map(albumEntries.map((entry) => [entry.entityUri, entry]));

    const albums: ArtistAlbum[] = [];
    let singlesStart = 0;
    for (const [type, groupAlbums] of groups) {
        if (type === 'single') singlesStart = albums.length;
        for (const groupAlbum of groupAlbums) {
            if (!groupAlbum.gid) continue;
            const albumUri = `spotify:album:${gidToId(groupAlbum.gid)}`;
            const a = albumByUri.get(albumUri);
            if (!a) continue;
            const album = Album.decode(a.value).toJSON() as {
                name?: string;
                date?: {year?: unknown};
                disc?: {track?: unknown[]}[];
            };
            albums.push({
                name: album.name ?? '',
                uri: albumUri,
                year: num(album.date?.year),
                trackCount: (album.disc ?? []).reduce(
                    (sum, disc) => sum + (disc.track?.length ?? 0),
                    0
                ),
                type
            });
        }
    }

    const info: ArtistInfo = {uri, name: artist.name ?? '', albums, singlesStart};
    artistCache.set(uri, info);
    return info;
}

// ── library: followed artists (port doc §7) ─────────────────────────
// VALIDATED LIVE 2026-10-18 (settles the old username question):
// - URL needs the trailing slash — /collection/v2/paging (no slash) 404s.
// - PageRequest.username can be ANY non-empty string ('bogus' returned the
//   token user's own artists; empty → HTTP 500) — the server identifies the
//   user from the token, so we pass 'me'.
// - set 'artist' → followed artists; set 'collection' → 403 for our scopes.
export type FollowedArtist = {name: string; uri: string};

export async function fetchFollowedArtists(): Promise<FollowedArtist[]> {
    const root = await protos;
    const PageRequest = root.lookupType('spotify.collection.proto.v2.PageRequest');
    const PageResponse = root.lookupType('spotify.collection.proto.v2.PageResponse');
    const Artist = root.lookupType('spotify.metadata.Artist');

    const payload = PageRequest.create({
        username: 'me',
        set: 'artist',
        paginationToken: '',
        limit: 300
    });
    const url = '/collection/v2/paging/';
    const response = await spFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/vnd.collection-v2.spotify.proto',
            Accept: 'application/vnd.collection-v2.spotify.proto'
        },
        body: PageRequest.encode(payload).finish()
    });
    if (!response.ok) {
        throw new SpError(response.status, await response.text(), url);
    }

    const decoded = PageResponse.decode(new Uint8Array(await response.arrayBuffer()));
    const uris: string[] = (decoded.toJSON().items ?? [])
        .filter((item: {uri?: string; isRemoved?: boolean}) => item.uri && !item.isRemoved)
        .map((item: {uri: string}) => item.uri)
        .filter((uri: string) => uri.startsWith('spotify:artist:'));

    // Collection items are uri-only — names come from a batched ARTIST_V4
    // request (one POST for every artist).
    const entries = uris.length
        ? await extendedMetadata(
              uris.map((uri) => ({entityUri: uri, extensionKind: EXTENSION_KIND.ARTIST_V4}))
          )
        : [];
    const byUri = new Map(entries.map((entry) => [entry.entityUri, entry]));

    const artists: FollowedArtist[] = [];
    for (const uri of uris) {
        const entry = byUri.get(uri);
        if (!entry) continue;
        const artist = Artist.decode(entry.value).toJSON() as {name?: string};
        artists.push({name: artist.name ?? uri, uri});
    }
    return artists;
}

// ── playlist contents (port doc §6) ─────────────────────────────────
// Plain JSON GET. `decorate=...,items` is what adds contents.items[].uri —
// without `items` the contents list comes back empty.
export type PlaylistInfo = {uri: string; name: string; trackUris: string[]};

const playlistCache = new Map<string, PlaylistInfo>();

export async function fetchPlaylist(uri: string): Promise<PlaylistInfo> {
    const cached = playlistCache.get(uri);
    if (cached) return cached;

    const id = uri.split(':')[2] ?? '';
    const url = `/playlist/v2/playlist/${id}?decorate=revision,attributes,length,owner,items`;
    const response = await spFetch(url, {headers: {Accept: 'application/json'}});
    if (!response.ok) {
        throw new SpError(response.status, await response.text(), url);
    }
    const body = (await response.json()) as {
        attributes?: {name?: string};
        contents?: {items?: {uri?: string}[]};
    };
    const trackUris = (body.contents?.items ?? [])
        .map((item) => item.uri ?? '')
        .filter((itemUri) => itemUri.startsWith('spotify:track:'));

    const info = {uri, name: body.attributes?.name ?? '', trackUris};
    playlistCache.set(uri, info);
    return info;
}

// Batched track names for a whole list — ONE extended-metadata POST for every
// uri (fills the per-track cache, so later fetchTrack calls hit memory).
export async function fetchTracks(uris: string[]): Promise<Map<string, TrackInfo>> {
    const unique = [...new Set(uris)];
    const missing = unique.filter((uri) => !trackCache.has(uri));
    if (missing.length) {
        const entries = await extendedMetadata(
            missing.map((uri) => ({entityUri: uri, extensionKind: EXTENSION_KIND.TRACK_V4}))
        );
        const root = await protos;
        const Track = root.lookupType('spotify.metadata.Track');
        for (const uri of missing) trackCache.set(uri, null);
        for (const entry of entries) {
            trackCache.set(
                entry.entityUri,
                trackInfoFromJson(Track.decode(entry.value).toJSON())
            );
        }
    }
    const out = new Map<string, TrackInfo>();
    for (const uri of unique) {
        const info = trackCache.get(uri);
        if (info) out.set(uri, info);
    }
    return out;
}

// ── playback commands (port doc §2) ─────────────────────────────
// Any {"endpoint": <name>, ...} body can be passed to sendPlayerCommand:
// resume/pause are plain {"endpoint": "resume"}; seek is {"endpoint": "seek_to",
// value: ms, position: ms}; shuffle {"endpoint": "set_shuffling_context",
// value: bool}; queue {"endpoint": "add_to_queue", track: {...}}.
function newCommandId(): string {
    // 32 hex chars of (Date.now() << 64n | random 64-bit) — spotatui's intent id.
    const random = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
    return (BigInt(Date.now()) << 64n | random).toString(16).padStart(32, '0');
}

export async function sendPlayerCommand(targetDeviceId: string, command: Record<string, unknown>): Promise<void> {
    const command_id = newCommandId();
    const now = Date.now();
    const options = {
        ...((command.options as Record<string, unknown> | undefined) ?? {}),
        override_restrictions: false,
        only_for_local_device: false,
        system_initiated: false
    };
    const body = {
        command: {
            ...command,
            options,
            logging_params: {
                command_initiated_time: now,
                command_received_time: now,
                page_instance_ids: [],
                interaction_ids: [],
                device_identifier: ourDeviceId(),
                command_id
            }
        },
        connection_type: 'wlan',
        intent_id: command_id
    };

    const url = `/connect-state/v1/player/command/from/${ourDeviceId()}/to/${targetDeviceId}`;
    const response = await spFetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new SpError(response.status, await response.text(), url);
    }
}

const playOrigin = {feature_identifier: 'spoty', feature_version: '1.4.1'};

// Play a context (album/playlist) — optionally skip to a track index/uri.
export function playCommand(
    contextUri: string,
    skip: {trackIndex?: number; trackUri?: string} = {}
): Record<string, unknown> {
    const skipTo: Record<string, unknown> = {};
    if (skip.trackIndex != null) skipTo.track_index = skip.trackIndex;
    if (skip.trackUri) skipTo.track_uri = skip.trackUri;
    return {
        endpoint: 'play',
        context: {
            uri: contextUri,
            url: `context://${contextUri}`,
            metadata: {}
        },
        play_origin: playOrigin,
        options: {
            license: 'premium',
            skip_to: skipTo,
            player_options_override: {}
        }
    };
}

// Play a bare list of track uris (Web API `uris` equivalent).
export function playTracksCommand(trackUris: string[], trackIndex = 0): Record<string, unknown> {
    return {
        endpoint: 'play',
        context: {
            uri: '',
            url: '',
            metadata: {},
            pages: [{tracks: trackUris.map((uri) => ({uri}))}]
        },
        play_origin: playOrigin,
        options: {
            license: 'premium',
            skip_to: {track_index: trackIndex},
            player_options_override: {}
        }
    };
}

// ── device transfer (port doc §3) ─────────────────────────────────
// Casing of the body is open question 2: try the remembered style first,
// fall back to the other, and keep whichever the server accepted.
let transferStyle: 'camel' | 'snake' = 'camel';

export async function transferPlayback(fromDeviceId: string, toDeviceId: string): Promise<void> {
    const url = `/connect-state/v1/connect/transfer/from/${fromDeviceId}/to/${toDeviceId}`;
    const bodies: Record<'camel' | 'snake', string> = {
        camel: JSON.stringify({transferOptions: {restorePaused: 'resume'}}),
        snake: JSON.stringify({transfer_options: {restore_paused: 'resume'}})
    };
    const order: ('camel' | 'snake')[] =
        transferStyle === 'camel' ? ['camel', 'snake'] : ['snake', 'camel'];

    let lastError: SpError | null = null;
    for (const style of order) {
        const response = await spFetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: bodies[style]
        });
        if (response.ok) {
            transferStyle = style;
            return;
        }
        lastError = new SpError(response.status, await response.text(), url);
        // Only retry the other casing for semantic errors — 401/429 need
        // different handling, not a different body.
        if (response.status === 401 || response.status === 429) throw lastError;
    }
    throw (lastError as SpError);
}
