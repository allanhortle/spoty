import {ListTable, Spinner, Text} from 'react-curse';
import {fetchPlaylist, fetchTracks} from '../util/spclient.js';
import {PlayerStore, usePlayer} from './Player.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';

// The old home was three columns of top artists (short/medium/long). The
// internal API has no top-artists endpoint, so the columns are the
// Made-For-You auto-playlists instead (port doc §9) — same URI for every
// account, the server fills them per user:
//   On Repeat — your most-played tracks (rolling ~30 days)
//   daylist   — tracks themed on what you've been playing (changes daily)
//   Repeat Rewind — the previous cycle's repeats
const COLUMNS = [
    {title: 'On Repeat', uri: 'spotify:playlist:37i9dQZF1EpptO20Ypcrhi'},
    {title: 'daylist', uri: 'spotify:playlist:37i9dQZF1EP6YuccBxUcC1'},
    {title: 'Repeat Rewind', uri: 'spotify:playlist:37i9dQZF1EpPDpKNGUYgYQ'}
] as const;

const useHomeData = createRequestHook({
    name: 'homeData',
    request: async () => {
        const playlists = await Promise.all(
            COLUMNS.map(({title, uri}) => fetchPlaylist(uri).then((playlist) => ({title, uri, playlist})))
        );
        const names = await fetchTracks(playlists.flatMap((column) => column.playlist.trackUris));
        return {
            columns: playlists.map(({title, uri, playlist}) => ({
                title,
                uri,
                tracks: playlist.trackUris.map((trackUri) => ({
                    uri: trackUri,
                    name: names.get(trackUri)?.name ?? ''
                }))
            }))
        };
    }
});

export default function Home() {
    const player = usePlayer();
    const message = useHomeData();
    useEffect(() => {
        if (message.isEmpty) message.request();
    }, []);
    if (message.isError) {
        // A failed Home fetch must not kill the whole TUI (learned the hard
        // way — the old getMyTopArtists 429 was fatal at boot).
        logger.error(message.error);
        return (
            <Text dim block>
                Home is unavailable (see ~/Library/Logs/spoty-nodejs/spoty.log)
            </Text>
        );
    }
    if (message.isEmpty || message.isFetching) return <Spinner color="white" />;

    const {columns} = message.data as {
        columns: {title: string; uri: string; tracks: {uri: string; name: string}[]}[];
    };
    const rows = Math.max(0, ...columns.map((column) => column.tracks.length));
    const data = Array.from({length: rows}, (_, y) => columns.map((column) => column.tracks[y]?.name ?? ''));
    const head = columns.map((column) => column.title);

    return (
        <Text>
            <Text bold height={2} block>
                Home
            </Text>
            <ListTable
                head={head}
                data={data}
                onSubmit={(next: {x: number; y: number}) => {
                    const column = columns[next.x];
                    if (!column?.tracks[next.y]) return;
                    // Play the column's playlist starting at that track.
                    PlayerStore.play(column.uri, {offset: {position: next.y}});
                }}
                renderHead={({item}: {item: string[]}) =>
                    item.map((title, key) => (
                        <Text key={key} bold width="33.333%">
                            {'  '}
                            {title}
                        </Text>
                    ))
                }
                renderItem={({item, x, y, index}: {item: string[]; x: number; y: number; index: number}) =>
                    item.map((name, key) => {
                        const track = columns[key].tracks[index];
                        const active = !!player.id && track?.uri === `spotify:track:${player.id}`;
                        return (
                            <Text
                                key={key}
                                width="33.333%"
                                wrap="truncate"
                                color={active ? 'green' : undefined}
                            >
                                {y === index && x === key ? '> ' : '  '}
                                {name}
                            </Text>
                        );
                    })
                }
            />
        </Text>
    );
}
