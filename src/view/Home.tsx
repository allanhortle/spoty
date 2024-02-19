import {Spinner, Text, ListTable, List} from 'react-curse';
import spotify from '../util/spotify.js';
import Router from '../util/router.js';
import {useEffect} from 'react';
import {createRequestHook} from 'react-enty';
import logger from '../util/logger.js';

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

    logger.info([short.length, medium.length, long.length]);

    const data = short.map((item, index) => {
        return [item.name, medium[index].name, long[index].name];
    });

    logger.info(new Set(data.flat(1)).size);
    const head = ['Short', 'Medium', 'Long'];
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
                    block
                    data={items}
                    onSubmit={(next: {y: number}) => Router.push(items[next.y].uri)}
                    renderItem={({item, selected}: {item: {name: string}; selected: boolean}) => {
                        const {name} = item;
                        //const date = release_date.split('-')[0];
                        //const details = `${total_tracks} tracks • ${date}`;
                        return (
                            <Text width="100%">
                                <Text>{selected ? '> ' : '  '}</Text>
                                <Text>{name}</Text>
                            </Text>
                        );
                    }}
                />
            </Text>
        </Text>
    );

    return (
        <ListTable
            head={head}
            data={data}
            onSubmit={(next: {y: number; x: number}) => {
                const {x, y} = next;
                logger.info({x, y});
                //const uri = album.tracks.items[next.y].uri;
                //logger.info(uri);
                //PlayerStore.play(album.uri, {offset: {position: next.y}});
            }}
            renderHead={({item}) =>
                item.map((i, key) => (
                    <Text key={key} bold width="33.333%">
                        {'  '}
                        {i}
                    </Text>
                ))
            }
            renderItem={({item, x, y, index}) =>
                item.map((text, key) => {
                    const active = y === index && x === key ? 'Green' : undefined;
                    return (
                        <Text key={key} width="33.333%">
                            {active ? '> ' : '  '}
                            {text}
                        </Text>
                    );
                })
            }
        />
    );
}
//renderItem={({
//item,
//y,
//x,
//index,
//...rest
//}: {
//item: string[];
//y: number;
//index: number;
//}) => {
////const [number, name, explicit, duration] = item;
////const details = `${explicit} ${duration}`;
////const id = album.tracks.items[index].id;
//const [short, medium, long] = item;
//return (
//<Text>
//<Text width="33.333%">{short}</Text>
//<Text width="33.333%">{long}</Text>
//<Text width="33.333%">{medium}</Text>
//</Text>
//);
//return (
//<Text color={player.id === id ? 'green' : undefined}>
//<Text>{y === index ? (changing ? '~ ' : '> ') : '  '}</Text>
//<Text dim width={number.length + 1} x={5 - number.length}>
//{number}
//</Text>
//<Text>{name}</Text>
//<Text x={`100%-${useChildrenSize(details).width}`}>{details}</Text>
//</Text>
//);
//}}
