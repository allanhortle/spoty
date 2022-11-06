import {Box, Text} from 'ink';
import {useEffect} from 'react';
import useScreenSize from '../util/useScreenSize';
import {useSnapshot} from 'valtio';
import {DeviceStore} from './Devices';
import spotify from '../util/spotify';
import logger from '../util/logger';
import timeToString from '../util/timeToString';
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
    const {width} = useScreenSize();
    const snap = useSnapshot(PlayerStore);
    const devicesSnap = useSnapshot(DeviceStore);

    const safeWidth = width - 12;
    const done = Math.round((safeWidth - 3) * snap.progressDecimal);

    const device = devicesSnap.activeDevice;
    useEffect(() => {
        PlayerStore.pollCurrentlyPlaying();
        const timer = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 500);

        return () => {
            clearInterval(timer);
        };
    }, []);

    return (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
            <Box justifyContent="space-between">
                <Text>
                    {snap.track} - {snap.album} - {snap.artist}
                </Text>
                <Text>
                    d={device?.name ?? '?'} v={device?.volume || 0}%
                </Text>
            </Box>
            <Box justifyContent="space-between" width={width - 2}>
                <Text color={snap.playing ? 'green' : 'yellow'}>{snap.progress}</Text>
                <Box justifyContent="space-between">
                    <Box>
                        <Text>{'='.repeat(done)}</Text>
                        <Text>{snap.playing ? '>' : '='}</Text>
                    </Box>
                    <Text>{'.'.repeat(safeWidth - 3 - done)}</Text>
                </Box>
                <Text>{snap.duration}</Text>
            </Box>
        </Box>
    );
}
