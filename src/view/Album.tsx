import {Box, Text, Key, Spacer} from 'ink';
import {proxy, useSnapshot} from 'valtio';
import logger from '../util/logger';
import spotify from '../util/spotify';
import type {Track, Album} from '../util/spotify';
import timeToString from '../util/timeToString';
import {PlayerStore} from './Player';
//import {Router} from '../index';

export const AlbumStore = proxy({
    selected: 0,
    tracks: [] as Track[],
    album: null as Album | null,
    next() {
        this.selected = (this.selected + 1) % this.tracks.length;
    },
    prev() {
        const next = this.selected - 1;
        this.selected = next === -1 ? this.tracks.length - 1 : next;
    },
    async mount(uri: string) {
        logger.info(uri);
        this.tracks = [];
        const [album, tracks] = await Promise.all([
            spotify.getAlbum(uri),
            spotify.getAlbumTracks(uri, {limit: 50})
        ]);
        this.tracks = tracks.body.items;
        this.album = album.body;
    },
    useInput(input: string, key: Key) {
        if (key.downArrow || input === 'j') return this.next();
        if (key.upArrow || input === 'k') return this.prev();
        if (key.return && this.album) {
            return PlayerStore.play(this.album.uri, {
                offset: {position: this.selected}
            });
        }
    }
});

export default function Album() {
    const snap = useSnapshot(AlbumStore);
    const playerSnap = useSnapshot(PlayerStore);

    if (!snap.tracks.length || !snap.album) return null;

    const trackNumberWidth = snap.tracks.reduce(
        (aa, bb) => Math.max(aa, String(bb.track_number).length),
        0
    );

    return (
        <>
            <Box marginBottom={1} flexDirection="column">
                <Text bold>{snap.album.artists.map((ii) => ii.name).join(', ')}</Text>
                <Text>{snap.album.name}</Text>
            </Box>
            <Box flexDirection="column">
                {snap.tracks.map((ii, index) => {
                    const color = playerSnap.id === ii.id ? 'green' : undefined;
                    return (
                        <Box key={index}>
                            <Text>{ii.id === snap.tracks[snap.selected]?.id ? '> ' : '  '}</Text>
                            <Text color={color || 'grey'}>
                                {String(ii.track_number).padStart(trackNumberWidth, ' ')}.
                            </Text>
                            <Text color={color}> {ii.name}</Text>
                            <Spacer />
                            {ii.explicit ? <Text color={color}>[E] </Text> : null}
                            <Text color={color}>{timeToString(ii.duration_ms)}</Text>
                        </Box>
                    );
                })}
            </Box>
        </>
    );
}
