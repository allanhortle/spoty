import {ListTable, Text, useChildrenSize} from 'react-curse';
import spotify from '../util/spotify.js';
import type {Album} from '../util/spotify.js';
import timeToString from '../util/timeToString.js';
import {createRequestHook} from 'react-enty';
import {useEffect} from 'react';
import {Spinner} from 'react-curse';
import {PlayerStore, usePlayer} from './Player.js';
import logger from '../util/logger.js';
import getColors from 'get-image-colors';

const useAlbumData = createRequestHook({
    name: 'useAlbumData',
    request: async (id: string) => {
        const {body} = await spotify.getAlbum(id);
        const cover = (await getColors(body.images[0].url, {count: 5})).map((x) => x.hex());
        return {album: body, cover};
    }
});

export default function Album({id}: {id: string}) {
    const player = usePlayer();
    const message = useAlbumData({key: id});
    useEffect(() => {
        if (message.isEmpty) message.request(id);
    }, [id]);

    if (message.isError) throw message.error;
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const {album, cover} = message.data;
    const changing = player.changing;
    const albumArtists = new Set(album.artists.map((ii) => ii.id));
    logger.info(cover);
    return (
        <>
            <Text background={cover[0]}> </Text>
            <Text background={cover[1]}> </Text>
            <Text bold block x={3}>
                {album.artists.map((ii) => ii.name).join(', ')}
            </Text>

            <Text background={cover[2]}> </Text>
            <Text background={cover[3]}> </Text>
            <Text block x={3}>
                {album.name}
            </Text>
            <ListTable
                data={album.tracks.items.map((item) => {
                    return [
                        `${item.track_number}.`,
                        item.name,
                        item.artists
                            .filter((ii) => !albumArtists.has(ii.id))
                            .map((ii) => ii.name)
                            .join(', '),
                        item.explicit ? '[E]' : '',
                        timeToString(item.duration_ms)
                    ];
                })}
                onSubmit={(next: {y: number}) => {
                    const uri = album.tracks.items[next.y].uri;
                    logger.info(uri);

                    PlayerStore.play(album.uri, {offset: {position: next.y}});
                }}
                renderItem={({item, y, index}: {item: string[]; y: number; index: number}) => {
                    const [number, name, features, explicit, duration] = item;
                    const details = `${explicit} ${duration}`;
                    const id = album.tracks.items[index].id;
                    return (
                        <Text color={player.id === id ? 'green' : undefined}>
                            <Text>{y === index ? (changing ? '~ ' : '> ') : '  '}</Text>
                            <Text dim width={number.length + 1} x={5 - number.length}>
                                {number}
                            </Text>
                            <Text>{name}</Text>
                            {features ? <Text dim> {features}</Text> : <Text />}
                            <Text x={`100%-${useChildrenSize(details).width}`}>{details}</Text>
                        </Text>
                    );
                }}
            />
        </>
    );
}
