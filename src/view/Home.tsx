import {ListTable, Spinner, Text} from 'react-curse';
import {fetchPlaylist, fetchTracks, TrackInfo} from '../util/spclient.js';
import {usePlayer} from './Player.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';
import Router from '../util/router.js';

// Home is album-focused (port doc §9 — there is no top-tracks/top-artists
// endpoint on spclient; the Made-For-You auto-playlists are our
// listening-derived data):
//   Recent  — albums aggregated from On Repeat + Repeat Rewind (this cycle's
//             and last cycle's most-played tracks), ranked by total plays.
//   daylist — albums aggregated from the daily themed recommendation playlist
//             (Spotify picks these from your recent listening).
// Each track's album comes free from the batched TRACK_V4 lookup; rows are
// albums with their main artist. Enter navigates to the album view
// (route = album uri — same as Search/Artist).
const RECENT_URIS = [
    'spotify:playlist:37i9dQZF1EpptO20Ypcrhi', // On Repeat
    'spotify:playlist:37i9dQZF1EpPDpKNGUYgYQ' // Repeat Rewind
] as const;
const DAYLIST_URI = 'spotify:playlist:37i9dQZF1EP6YuccBxUcC1';

type AlbumRow = {uri: string; name: string; artist: string; plays: number};

// Aggregate playlist tracks into unique albums ranked by how often they
// appear (each appearance in these auto-playlists = one repeat play).
function aggregateAlbums(trackUris: string[], tracks: Map<string, TrackInfo>): AlbumRow[] {
    const byUri = new Map<string, AlbumRow>();
    for (const trackUri of trackUris) {
        const track = tracks.get(trackUri);
        if (!track?.albumUri || !track.albumName) continue;
        const existing = byUri.get(track.albumUri);
        if (existing) {
            existing.plays++;
            continue;
        }
        byUri.set(track.albumUri, {
            uri: track.albumUri,
            name: track.albumName,
            artist: track.artists[0] ?? '',
            plays: 1
        });
    }
    return [...byUri.values()].sort((a, b) => b.plays - a.plays);
}

const useHomeData = createRequestHook({
    name: 'homeData',
    request: async () => {
        const [recent, daylist] = await Promise.all([
            Promise.all(RECENT_URIS.map((uri) => fetchPlaylist(uri))),
            fetchPlaylist(DAYLIST_URI)
        ]);
        const recentTrackUris = recent.flatMap((playlist) => playlist.trackUris);
        // One batched TRACK_V4 POST fills every name + album/artist uri.
        const tracks = await fetchTracks([...recentTrackUris, ...daylist.trackUris]);
        return {
            columns: [
                {title: 'Recent', albums: aggregateAlbums(recentTrackUris, tracks)},
                {title: 'daylist', albums: aggregateAlbums(daylist.trackUris, tracks)}
            ]
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

    const {columns} = message.data as {columns: {title: string; albums: AlbumRow[]}[]};
    const rows = Math.max(0, ...columns.map((column) => column.albums.length));
    const data = Array.from({length: rows}, (_, y) =>
        columns.map((column) => column.albums[y]?.name ?? '')
    );
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
                    const album = columns[next.x]?.albums[next.y];
                    if (album) Router.push(album.uri);
                }}
                renderHead={({item}: {item: string[]}) =>
                    item.map((title, key) => (
                        <Text key={key} bold width="50%">
                            {'  '}
                            {title}
                        </Text>
                    ))
                }
                renderItem={({item, x, y, index}: {item: string[]; x: number; y: number; index: number}) =>
                    item.map((_, key) => {
                        const album = columns[key].albums[index];
                        if (!album) return <Text key={key} width="50%" />;
                        const active = player.albumUri === album.uri;
                        return (
                            <Text
                                key={key}
                                width="50%"
                                wrap="truncate"
                                color={active ? 'green' : undefined}
                            >
                                {y === index && x === key ? '> ' : '  '}
                                {album.name} — {album.artist}
                            </Text>
                        );
                    })
                }
            />
        </Text>
    );
}
