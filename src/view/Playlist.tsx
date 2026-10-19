import {ListTable, Spinner, Text} from 'react-curse';
import {fetchPlaylist, fetchTracks, TrackInfo} from '../util/spclient.js';
import {PlayerStore, usePlayer} from './Player.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';
import timeToString from '../util/timeToString.js';

// Playlist view (route spotify:playlist:<id>) — contents via §6
// (fetchPlaylist) + one batched TRACK_V4 POST for names/durations
// (fetchTracks). Enter plays the playlist from the selected track
// (playCommand context + skip_to, like the Album view).
const usePlaylistData = createRequestHook({
    name: 'playlist',
    request: async (id: string) => {
        const uri = `spotify:playlist:${id}`;
        const playlist = await fetchPlaylist(uri);
        const tracks = await fetchTracks(playlist.trackUris);
        const rows = playlist.trackUris.map((trackUri) => {
            const track = tracks.get(trackUri);
            return {
                uri: trackUri,
                name: track?.name ?? '',
                artists: track?.artists ?? [],
                durationMs: track?.durationMs ?? 0
            };
        });
        return {name: playlist.name, uri, rows};
    }
});

export default function Playlist({id}: {id: string}) {
    const player = usePlayer();
    const message = usePlaylistData({key: id});
    useEffect(() => {
        if (message.isEmpty) message.request(id);
    }, [id]);

    // Same lesson as Home/Search/Album: a failed fetch must not kill the TUI.
    if (message.isError) {
        logger.error(message.error);
        return (
            <Text dim block>
                Playlist failed — try again (see ~/Library/Logs/spoty-nodejs/spoty.log)
            </Text>
        );
    }
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const {name, uri, rows} = message.data as {
        name: string;
        uri: string;
        rows: {uri: string; name: string; artists: string[]; durationMs: number}[];
    };
    return (
        <>
            <Text bold block>
                {name}
            </Text>
            <Text block />
            <ListTable
                data={rows.map((row) => [row.name, row.artists.join(', '), timeToString(row.durationMs)])}
                onSubmit={(next: {y: number}) => {
                    const row = rows[next.y];
                    if (row) PlayerStore.play(uri, {offset: {position: next.y}});
                }}
                renderItem={({item, y, index}: {item: string[]; y: number; index: number}) => {
                    const [trackName, artists, duration] = item;
                    const active = player.trackUri === rows[index]?.uri;
                    return (
                        <Text color={active ? 'green' : undefined}>
                            <Text>{y === index ? (player.changing ? '~ ' : '> ') : '  '}</Text>
                            <Text wrap="truncate">{trackName}</Text>
                            <Text dim x="100%-6" wrap="truncate">
                                {artists} {duration}
                            </Text>
                        </Text>
                    );
                }}
            />
        </>
    );
}
