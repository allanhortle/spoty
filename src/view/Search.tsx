import {Box, Text, Key} from 'ink';
import {useSnapshot} from 'valtio';
import TextInput from 'ink-text-input';
import {proxy} from 'valtio';
import spotify from '../util/spotify';
import logger from '../util/logger';
import {Router} from '../index';

export const SearchStore = proxy({
    items: new Array<{name: string; type: string; uri: string; artist: string}>(),
    type: 'artist' as 'album' | 'artist',
    selected: 0,
    query: '',
    async search(query: string) {
        const {body} = await spotify.search(query, [this.type], {limit: 20});
        const albums = (body.albums?.items || []).map(({name, type, uri, artists}) => ({
            name,
            type,
            uri,
            artist: artists.map((ii) => ii.name).join(', ')
        }));
        const artists = (body.artists?.items || []).map(({name, type, uri}) => ({
            name,
            type,
            uri,
            artist: name
        }));
        this.items = [...artists, ...albums];
        this.selected = 0;
    },
    next() {
        this.selected = Math.min(this.items.length, this.selected + 1);
    },
    prev() {
        this.selected = Math.max(0, this.selected - 1);
    },
    reset() {
        this.selected = 0;
        this.items = [];
        this.query = '';
    },
    useInput(input: string, key: Key) {
        if (key.downArrow || input === 'j') {
            return SearchStore.next();
        }
        if (key.upArrow || input === 'k') {
            return SearchStore.prev();
        }
        if (key.tab) {
            this.type = this.type === 'album' ? 'artist' : 'album';
            this.query = '';
            this.items = [];
        }
        if (key.return) {
            if (this.items.length) {
                logger.info(this.items[this.selected]);
                const uri = this.items[this.selected].uri;
                Router.push(uri);
                SearchStore.reset();
            } else {
                return SearchStore.search(this.query);
            }
        }
    }
});

export default function Search() {
    const snap = useSnapshot(SearchStore);

    return (
        <>
            <Box justifyContent="space-between">
                <Box marginBottom={1}>
                    <Text bold>Search: </Text>
                    <TextInput
                        value={snap.query}
                        onChange={(next) => (SearchStore.query = next)}
                        focus={!snap.items.length}
                    />
                </Box>
                <Box>
                    <Text color={snap.type === 'album' ? 'yellow' : undefined}>album</Text>
                    <Text> </Text>
                    <Text color={snap.type === 'artist' ? 'yellow' : undefined}>artist</Text>
                </Box>
            </Box>
            {snap.items.map((ii, index) => {
                return (
                    <Box key={index}>
                        <Text>{index === snap.selected ? '> ' : '  '}</Text>
                        <Text wrap="truncate">
                            {snap.type === 'album' ? `${ii.name} - ${ii.artist}` : ii.name}
                        </Text>
                    </Box>
                );
            })}
        </>
    );
}
