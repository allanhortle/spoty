import {Spinner, Text} from 'react-curse';
import spotify from '../util/spotify.js';
import Router from '../util/router.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import List from '../components/List.js';

const useHomeData = createRequestHook({
    name: 'homeData',
    request: async () => {
        const [short, medium, long] = await Promise.all([
            spotify.getMyTopArtists({time_range: 'short_term'}).then((x) => x.body.items),
            spotify.getMyTopArtists({time_range: 'medium_term'}).then((x) => x.body.items),
            spotify.getMyTopArtists({time_range: 'long_term'}).then((x) => x.body.items)
        ]);

        return {short, medium, long};
    }
});

export default function Home() {
    const message = useHomeData();
    useEffect(() => {
        if (message.isEmpty) message.request();
    }, []);
    if (message.isError) throw message.error;
    if (message.isEmpty || message.isFetching) return <Spinner color="white" />;
    const {short, medium, long} = message.data;

    const shortSet = new Set(short.map((ii) => ii.name));
    const mediumSet = new Set(medium.map((ii) => ii.name));

    const mediumItems = medium.filter((ii) => !shortSet.has(ii.name));
    const longItems = long.filter((ii) => !shortSet.has(ii.name) && !mediumSet.has(ii.name));
    const items = [...short, ...mediumItems, ...longItems];

    return (
        <Text>
            <Text bold height={2} block>
                Top Artists
            </Text>
            <Text dim block>
                Short
            </Text>
            <Text dim block y={short.length}>
                Medium
            </Text>
            <Text dim block y={short.length + mediumItems.length}>
                Long
            </Text>
            <Text x={8} y={2}>
                <List
                    data={items}
                    onChange={(next) => Router.push(next.uri)}
                    renderItem={(item) => <Text>{item.name}</Text>}
                />
            </Text>
        </Text>
    );
}
