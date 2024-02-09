import {Text, useChildrenSize, useSize} from 'react-curse';
import {useEffect} from 'react';
import {useSnapshot} from 'valtio';
import spotify from '../util/spotify.js';
import logger from '../util/logger.js';
import timeToString from '../util/timeToString.js';
import {proxy} from 'valtio';

export const PlayerStore = proxy({
    playing: false,
    track: '',
    artist: '',
    album: '',
    id: '',
    foo: 23,
    progress: '00:00',
    progressDecimal: 0,
    duration: '00:00',
    shouldPoll: true,
    async pollCurrentlyPlaying() {
        if (!this.shouldPoll) return;
        try {
            const {body} = await spotify.getMyCurrentPlayingTrack();
            const {progress_ms, item} = body;
            const duration = item?.duration_ms || 0;
            const progress = progress_ms || 0;

            this.playing = body.is_playing;
            this.progress = timeToString(progress);
            this.progressDecimal = progress / duration;
            this.duration = timeToString(duration);

            if (body?.item) {
                if (body.item.type === 'track') {
                    const {album, artists, name} = body.item;
                    this.track = name;
                    this.id = body.item.id;
                    this.artist = artists.map((ii) => ii.name).join(', ');
                    this.album = album.name;
                } else {
                    throw new Error(`${body.item.type} not accounted for`);
                }
            }
        } catch (e) {
            this.shouldPoll = false;
            logger.info('polling error');
            logger.error(e);
        }
    },
    async playPause() {
        const device_id = DeviceStore.activeDevice?.id;
        if (!device_id) return logger.error('cant play, no device_id');
        const {body} = await spotify.getMyCurrentPlaybackState();
        if (body.is_playing && body.currently_playing_type !== 'unknown') {
            await spotify.pause({device_id});
            return;
        } else {
            await spotify.play({device_id});
            return;
        }
    },
    play(context_uri: string, options: Parameters<typeof spotify.play>[0]) {
        logger.info({context_uri});
        const device_id = DeviceStore.activeDevice?.id;
        if (!device_id) return logger.error('cant play, no device_id', {context_uri});
        spotify.play({device_id, context_uri, ...options}).catch(logger.error);
    }
});

export default function Player() {
    const snap = useSnapshot(PlayerStore);
    const {width} = useSize();

    const done = Math.round(width * snap.progressDecimal);

    const device = {};
    useEffect(() => {
        PlayerStore.pollCurrentlyPlaying();
        const timer = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 500);

        return () => {
            clearInterval(timer);
        };
    }, []);

    const deviceDetails = `d=${device?.name ?? '?'} v=${device?.volume || 0}%`;

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
                <Text>{'.'.repeat(width - done)}</Text>
            </Text>
        </Text>
    );
}
