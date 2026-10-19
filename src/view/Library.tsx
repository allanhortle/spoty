import {Text, Spinner, useInput} from 'react-curse';
import {fetchLibrary, LibraryFilter, LibraryItem} from '../util/pathfinder.js';
import Router from '../util/router.js';
import {useEffect, useState} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';
import List from '../components/List.js';

// Your Library — playlists / followed artists / saved albums via the web
// player's libraryV3 pathfinder query (port doc §10). Tab cycles the filter
// (same interaction as Search); Enter drills in: artists/albums reuse their
// views, playlists open the Playlist view (route = the item's uri).
const TABS: LibraryFilter[] = ['Playlists', 'Artists', 'Albums'];

const useLibraryData = createRequestHook({
    name: 'library',
    request: async (filter: LibraryFilter) => fetchLibrary(filter)
});

export default function Library() {
    const [tab, setTab] = useState(0);
    const message = useLibraryData({key: TABS[tab]});

    useEffect(() => {
        if (message.isEmpty) message.request(TABS[tab]);
    }, [tab]);

    useInput(
        (key: string) => {
            if (key === '\t') setTab((next) => (next + 1) % TABS.length);
        },
        [tab]
    );

    if (message.isError) {
        // Same lesson as Home/Search: a failed fetch must not kill the TUI.
        logger.error(message.error);
        return (
            <Text dim block>
                Library failed — try again (see ~/Library/Logs/spoty-nodejs/spoty.log)
            </Text>
        );
    }
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const items = message.data as LibraryItem[];
    return (
        <>
            <Text>
                <Text bold>Library</Text>
                <Text dim x="100%-24">
                    {TABS.map((title, index) => ({
                        title,
                        color: index === tab ? 'yellow' : undefined
                    })).map(({title, color}, key) => (
                        <Text key={title} color={color}>
                            {title}{' '}
                        </Text>
                    ))}
                </Text>
            </Text>
            <Text block />
            <List
                focus={true}
                data={items}
                onChange={(next) => Router.push(next.uri)}
                renderItem={(item) => (
                    <Text wrap="truncate">
                        {item.artist ? `${item.name} — ${item.artist}` : item.name}
                    </Text>
                )}
            />
        </>
    );
}
