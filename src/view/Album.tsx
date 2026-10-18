import {ListTable, Text, useChildrenSize} from 'react-curse';
import {fetchAlbum, AlbumInfo} from '../util/spclient.js';
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
        const album = await fetchAlbum(`spotify:album:${id}`);
        if (!album) throw new Error('Album not found');
        const cover = album.coverUrl
            ? (await getColors(album.coverUrl, {count: 5})).map((x) => x.hex())
            : [];
        return {album, cover};
    }
});

export default function Album({id}: {id: string}) {
    const player = usePlayer();
    const message = useAlbumData({key: id});
    useEffect(() => {
        if (message.isEmpty) message.request(id);
    }, [id]);

    // Same lesson as Search/Home: a failed fetch must not kill the TUI.
    if (message.isError) {
        logger.error(message.error);
        return (
            <Text dim block>
                Album failed — try again (see ~/Library/Logs/spoty-nodejs/spoty.log)
            </Text>
        );
    }
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const {album, cover} = message.data as {album: AlbumInfo; cover: string[]};
    const changing = player.changing;
    return (
        <>
            <Text background={cover[0]}> </Text>
            <Text background={cover[1]}> </Text>
            <Text bold block x={3}>
                {album.artists.join(', ')}
            </Text>

            <Text background={cover[2]}> </Text>
            <Text background={cover[3]}> </Text>
            <Text block x={3}>
                {album.name}
            </Text>
            <ListTable
                data={album.tracks.map((track) => {
                    return [
                        `${track.number}.`,
                        track.name,
                        track.artists.join(', '),
                        track.explicit ? '[E]' : '',
                        timeToString(track.durationMs)
                    ];
                })}
                onSubmit={(next: {y: number}) => {
                    const track = album.tracks[next.y];
                    if (!track) return;
                    logger.info(track.uri);

                    PlayerStore.play(album.uri, {offset: {position: track.index}});
                }}
                renderItem={({item, y, index}: {item: string[]; y: number; index: number}) => {
                    const [number, name, features, explicit, duration] = item;
                    const details = `${explicit} ${duration}`;
                    const track = album.tracks[index];
                    return (
                        <Text color={player.id === track?.id ? 'green' : undefined}>
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
