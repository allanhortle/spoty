import {Text, useChildrenSize, useSize} from 'react-curse';
import {useEffect} from 'react';
import {useSnapshot} from 'valtio';
import {
    fetchCluster,
    fetchTrack,
    playCommand,
    playTracksCommand,
    sendPlayerCommand,
    transferPlayback,
    ClusterInfo
} from '../util/spclient.js';
import logger from '../util/logger.js';
import timeToString from '../util/timeToString.js';
import {proxy} from 'valtio';

export type Device = {id: string | null; active: boolean; name: string; volume: number};

// PlayerState.track.metadata uses snake_case keys (validated live):
// title, album_title, album_uri, artist_uri — there is NO artist name; it is
// enriched separately via extended-metadata (fetchTrack).
function trackId(uri: string): string {
    return uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : '';
}

export const PlayerStore = proxy({
    playing: false,
    track: '',
    artist: '',
    album: '',
    id: '',
    albumUri: '',
    progress: '00:00',
    progressDecimal: 0,
    duration: '00:00',
    shouldPoll: true,
    activeDevice: undefined as Device | undefined,
    devices: [] as Device[],
    changing: false,

    // Raw player state for local position interpolation between polls.
    positionMs: 0,
    durationMs: 0,
    positionAsOf: 0, // Date.now() of the poll that produced positionMs
    paused: true,
    trackUri: '',

    async mount() {
        // Spotify rate limits the shared first-party quota (HTTP 429), so a
        // device fetch can fail at boot. Retry quietly instead of dying: the
        // valtio store updates the UI when the list finally arrives.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this.fetchDevices();
                break;
            } catch (e) {
                logger.error(e);
                await new Promise((resolve) => setTimeout(resolve, 30000));
            }
        }
        if (this.devices.length === 1) this.activeDevice = this.devices[0];
    },

    async selectDevice(device: Device) {
        // from = current active device, or the target itself when nothing is
        // active yet (port doc §3).
        const from = this.activeDevice?.id ?? device.id;
        this.activeDevice = device;
        if (!device.id || !from) return;
        this.changing = true;
        try {
            await transferPlayback(from, device.id);
            await this.pollCurrentlyPlaying();
        } catch (e) {
            logger.error(e);
        }
        this.changing = false;
    },

    // One observer PUT against spclient returns the whole cluster: the device
    // list plus the active device's player state. (The old Web API
    // getMyDevices is permanently 429 for our client id.)
    async fetchDevices() {
        this.applyCluster(await fetchCluster());
    },

    applyCluster(cluster: ClusterInfo) {
        this.devices = cluster.devices.map((ii) => ({
            id: ii.id,
            active: ii.id === cluster.activeDeviceId,
            name: ii.name,
            volume: ii.volume
        }));
        this.activeDevice = this.devices.find((ii) => ii.active);

        const state = cluster.playerState;
        if (!state) return;

        this.playing = !state.isPaused && !state.isBuffering;
        this.paused = state.isPaused;
        this.positionMs = state.positionMs;
        this.positionAsOf = Date.now();
        this.durationMs = state.durationMs;
        this.duration = timeToString(state.durationMs);

        const {metadata, trackUri, contextUri} = state;
        this.track = metadata['title'] ?? '';
        this.id = trackId(trackUri);
        this.album = metadata['album_title'] ?? '';
        this.albumUri =
            metadata['album_uri'] ??
            (contextUri.startsWith('spotify:album:') ? contextUri : '');

        if (this.trackUri !== trackUri) {
            this.trackUri = trackUri;
            this.artist = '';
            this.enrichArtist(trackUri);
        }

        this.interpolate();
    },

    // connect-state carries no artist name — resolve it via extended-metadata,
    // once per track (fetchTrack caches). Guarded so a slow response for a
    // previous track can't overwrite the current one.
    async enrichArtist(trackUri: string) {
        if (!trackUri) return;
        try {
            const track = await fetchTrack(trackUri);
            if (track && this.trackUri === trackUri) {
                this.artist = track.artists.join(', ');
                if (!this.album) this.album = track.albumName;
            }
        } catch (e) {
            logger.error(e);
        }
    },

    // Advance the progress bar locally between polls using
    // positionAsOfTimestamp + (now - poll time); polls are every ~5s.
    interpolate() {
        if (!this.durationMs) return;
        let position = this.positionMs;
        if (!this.paused) position += Date.now() - this.positionAsOf;
        if (position > this.durationMs) position = this.durationMs;
        this.progress = timeToString(position);
        this.progressDecimal = position / this.durationMs;
    },

    async pollCurrentlyPlaying() {
        if (!this.shouldPoll) return;
        try {
            this.applyCluster(await fetchCluster());
        } catch (e) {
            logger.error(e);
            // Back off instead of stopping forever: one bad response shouldn't
            // kill the player UI permanently.
            const rateLimited = (e as {statusCode?: number} | null)?.statusCode === 429;
            this.shouldPoll = false;
            setTimeout(() => {
                this.shouldPoll = true;
            }, rateLimited ? 60000 : 10000);
        }
    },
    async playPause() {
        try {
            const device_id = this.activeDevice?.id;
            if (!device_id) return logger.error('cant play, no device_id');
            // Fresh state first so a stale poll can't pause an already-paused
            // device (the old code did the same via getMyCurrentPlaybackState).
            await this.fetchDevices();
            const target = this.activeDevice?.id ?? device_id;
            await sendPlayerCommand(target, {endpoint: this.paused ? 'resume' : 'pause'});
            // Optimistic flip; the poll right behind it confirms.
            this.paused = !this.paused;
            this.playing = !this.paused;
            this.positionAsOf = Date.now();
            await this.pollCurrentlyPlaying();
        } catch (e) {
            // Runs from a keypress; an unhandled throw here would crash the TUI.
            logger.error(e);
        }
    },
    async play(
        context_uri: string,
        options: {uris?: string[]; offset?: {position?: number; uri?: string}} = {}
    ) {
        this.changing = true;
        logger.info({context_uri, ...options});
        const device_id = this.activeDevice?.id;
        if (!device_id) {
            this.changing = false;
            return logger.error('cant play, no device_id', {context_uri});
        }
        try {
            const command = options.uris?.length
                ? playTracksCommand(options.uris, options.offset?.position ?? 0)
                : playCommand(context_uri, {
                      trackIndex: options.offset?.position,
                      trackUri: options.offset?.uri
                  });
            await sendPlayerCommand(device_id, command);
            await this.pollCurrentlyPlaying();
        } catch (e) {
            logger.error(e);
        }
        this.changing = false;
    }
});

export function usePlayer() {
    return useSnapshot(PlayerStore);
}

export default function Player() {
    const snap = useSnapshot(PlayerStore);
    const {width} = useSize();

    const done = Math.round(width * snap.progressDecimal) || 0;

    useEffect(() => {
        PlayerStore.pollCurrentlyPlaying();
        const poll = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 5000);
        // The progress bar only needs local clock ticks, not a network poll.
        const tick = setInterval(() => {
            PlayerStore.interpolate();
        }, 500);

        return () => {
            clearInterval(poll);
            clearInterval(tick);
        };
    }, []);

    const deviceDetails = `d=${snap.activeDevice?.name ?? '?'} v=${
        snap.activeDevice?.volume || 0
    }%`;

    return (
        <Text>
            <Text block>
                <Text>
                    {snap.track} - {snap.album} - {snap.artist}
                </Text>
                <Text x={`100%-${useChildrenSize(deviceDetails).width}`}>{deviceDetails}</Text>
            </Text>
            <Text dim>
                <Text>{'='.repeat(done)}</Text>
                <Text>{snap.playing ? '>' : '='}</Text>
                <Text>{'.'.repeat(Math.max(0, width - done))}</Text>
            </Text>
        </Text>
    );
}
