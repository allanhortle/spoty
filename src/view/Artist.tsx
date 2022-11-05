import {Box, Text, Key, Spacer} from 'ink';
import groupBy from 'lodash/groupBy';
import {proxy, useSnapshot} from 'valtio';
import {Router} from '..';
import logger from '../util/logger';
import spotify from '../util/spotify';
import type {AlbumSimple, ArtistSimple} from '../util/spotify';

export const ArtistStore = proxy({
    selected: 0,
    artist: null as ArtistSimple | null,
    albums: [] as AlbumSimple[],
    activeArtist: null as ArtistSimple | null,
    next() {
        this.selected = (this.selected + 1) % this.albums.length;
    },
    prev() {
        const next = this.selected - 1;
        this.selected = next === -1 ? this.albums.length - 1 : next;
    },
    async mount(uri: string) {
        this.artist = null;
        this.albums = [];
        const {body} = await spotify.getArtistAlbums(uri, {limit: 50});
        logger.info(body);
        this.albums = body.items;
        this.artist = body.items[0].artists[0];
    },
    useInput(input: string, key: Key) {
        if (key.downArrow || input === 'j') {
            return this.next();
        }
        if (key.upArrow || input === 'k') {
            return this.prev();
        }
        if (key.return) Router.push(this.albums[this.selected].uri);

        //if (input === '+') return this.setVolume(10);
        //if (input === '-') return this.setVolume(-10);
    }
});

export default function Artist() {
    const snap = useSnapshot(ArtistStore);

    if (!snap.artist || !snap.albums.length) return null;

    const groups = groupBy(snap.albums, 'album_group');

    function album(list: AlbumSimple[]) {
        return list.map((ii, index) => (
            <Box key={index}>
                <Text>{ii.id === snap.albums[snap.selected]?.id ? '> ' : '  '}</Text>
                <Text>{ii.name}</Text>
                <Spacer />
                <Text>{ii.total_tracks} tracks</Text>
                <Text> • </Text>
                <Text>{ii.release_date.split('-')[0]}</Text>
            </Box>
        ));
    }

    return (
        <>
            <Box marginBottom={1}>
                <Text bold>{snap.artist.name}</Text>
            </Box>
            <Box flexDirection="column">
                <Text color="grey">Albums</Text>
                {album(groups.album)}

                {groups.single && (
                    <>
                        <Box marginTop={1}>
                            <Text color="grey">Singles</Text>
                        </Box>
                        {album(groups.single)}
                    </>
                )}
            </Box>
        </>
    );
}
