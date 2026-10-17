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

export type TrackInfo = {name: string; artists: string[]; albumName: string; durationMs: number};

const trackCache = new Map<string, TrackInfo | null>();

export async function fetchTrack(uri: string): Promise<TrackInfo | null> {
    if (trackCache.has(uri)) return trackCache.get(uri) ?? null;

    const root = await protos;
    const Request = root.lookupType('spotify.extendedmetadata.BatchedEntityRequest');
    const Response = root.lookupType('spotify.extendedmetadata.BatchedExtensionResponse');
    const Track = root.lookupType('spotify.metadata.Track');

    const payload = Request.create({
        header: {country: COUNTRY, catalogue: 'premium'},
        entityRequest: [{entityUri: uri, query: [{extensionKind: 10 /* TRACK_V4 */}]}]
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
    let info: TrackInfo | null = null;
    for (const array of decoded.extendedMetadata ?? []) {
        for (const data of array.extensionData ?? []) {
            if (data.entityUri !== uri) continue;
            const any = data.extensionData as unknown as {type_url?: string; value?: Uint8Array};
            if (!any.value) continue;
            const track = Track.decode(any.value).toJSON() as {
                name?: string;
                artist?: {name?: string}[];
                album?: {name?: string};
                duration?: unknown;
            };
            info = {
                name: track.name ?? '',
                artists: (track.artist ?? []).map((artist) => artist.name ?? '').filter(Boolean),
                albumName: track.album?.name ?? '',
                durationMs: num(track.duration)
            };
        }
    }
    trackCache.set(uri, info);
    return info;
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
