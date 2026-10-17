import {Text, useChildrenSize, useSize} from 'react-curse';
import {useEffect} from 'react';
import {useSnapshot} from 'valtio';
import spotify from '../util/spotify.js';
import logger from '../util/logger.js';
import timeToString from '../util/timeToString.js';
import {proxy} from 'valtio';

export type Device = {id: string | null; active: boolean; name: string; volume: number};

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
        this.activeDevice = device;
        if (device.id) spotify.transferMyPlayback([device.id]);
    },

    async fetchDevices() {
        const {body} = await spotify.getMyDevices();
        this.devices = body.devices.map((ii) => ({
            id: ii.id,
            active: ii.is_active,
            name: ii.name,
            volume: ii.volume_percent || 0
        }));

        this.activeDevice = this.devices.find((ii) => ii.active);
    },

    async pollCurrentlyPlaying() {
        if (!this.shouldPoll) return;
        try {
            const {body} = await spotify.getMyCurrentPlayingTrack();
            const {progress_ms, item} = body;
            this.playing = body.is_playing;
            const duration = item?.duration_ms || 0;
            this.duration = timeToString(duration);

            if (duration > 0) {
                const progress = progress_ms || 0;
                this.progress = timeToString(progress);
                this.progressDecimal = progress / duration;
            }

            if (body?.item) {
                if (body.item.type === 'track') {
                    const {album, artists, name} = body.item;
                    this.track = name;
                    this.id = body.item.id;
                    this.artist = artists.map((ii) => ii.name).join(', ');
                    this.album = album.name;
                    this.albumUri = album.uri;
                } else {
                    throw new Error(`${body.item.type} not accounted for`);
                }
            }
        } catch (e) {
            logger.error(e);
            // Back off instead of stopping forever: a 429 asks for ~a minute,
            // and one bad response shouldn't kill the player UI permanently.
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
            const {body} = await spotify.getMyCurrentPlaybackState();
            if (body.is_playing && body.currently_playing_type !== 'unknown') {
                await spotify.pause({device_id});
                return;
            } else {
                await spotify.play({device_id});
                return;
            }
        } catch (e) {
            // Runs from a keypress; an unhandled throw here would crash the TUI.
            logger.error(e);
        }
    },
    async play(context_uri: string, options: Parameters<typeof spotify.play>[0]) {
        this.changing = true;
        logger.info({context_uri});
        const device_id = this.activeDevice?.id;
        if (!device_id) return logger.error('cant play, no device_id', {context_uri});
        const payload = {device_id, context_uri, ...options};
        logger.info('play', payload);
        await spotify.play(payload).catch(logger.error);
        await this.pollCurrentlyPlaying();
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
        const timer = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 3000);

        return () => {
            clearInterval(timer);
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
