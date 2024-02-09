import {ListTable, Text, useChildrenSize} from 'react-curse';
import spotify from '../util/spotify.js';
import type {Album} from '../util/spotify.js';
import timeToString from '../util/timeToString.js';
import {createRequestHook} from 'react-enty';
import {useEffect} from 'react';
import {Spinner} from 'react-curse';

const useAlbumData = createRequestHook({
    name: 'useAlbumData',
    request: async (id: string) => {
        const {body} = await spotify.getAlbum(id);
        return {album: body};
    }
});

export default function Album({id}: {id: string}) {
    const message = useAlbumData({key: id});
    useEffect(() => {
        if (message.isEmpty) message.request(id);
    }, [id]);

    if (message.isError) throw message.error;
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const {album} = message.data;

    return (
        <>
            <Text bold block>
                {album.artists.map((ii) => ii.name).join(', ')}
            </Text>
            <Text block>{album.name}</Text>
            <ListTable
                data={album.tracks.items.map((item) => [
                    `${item.track_number}.`,
                    item.name,
                    item.explicit ? '[E]' : '',
                    timeToString(item.duration_ms)
                ])}
                renderItem={({item, y, index}: {item: string[]; y: number; index: number}) => {
                    const [number, name, explicit, duration] = item;
                    const details = `${explicit} ${duration}`;
                    return (
                        <>
                            <Text>{y === index ? '> ' : '  '}</Text>
                            <Text dim width={number.length + 1} x={5 - number.length}>
                                {number}
                            </Text>
                            <Text>{name}</Text>
                            <Text x={`100%-${useChildrenSize(details).width}`}>{details}</Text>
                        </>
                    );
                }}
            />
        </>
    );
}
