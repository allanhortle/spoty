import {Spinner, Text} from 'react-curse';
import {fetchFollowedArtists} from '../util/spclient.js';
import Router from '../util/router.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';
import List from '../components/List.js';

// The old Home showed Web-API "top artists" (short/medium/long) — that data
// isn't reachable from spclient with known operations, so Home now shows the
// followed-artists collection instead (port doc §7).
const useHomeData = createRequestHook({
    name: 'homeData',
    request: async () => {
        const artists = await fetchFollowedArtists();
        return {artists};
    }
});

export default function Home() {
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
    const {artists} = message.data as {artists: {name: string; uri: string}[]};

    return (
        <Text>
            <Text bold height={2} block>
                Followed Artists
            </Text>
            <Text y={2}>
                <List
                    data={artists}
                    onChange={(next) => Router.push(next.uri)}
                    renderItem={(item) => <Text>{item.name}</Text>}
                />
            </Text>
        </Text>
    );
}
