import {useChildrenSize, Spinner, Text} from 'react-curse';
import spotify from '../util/spotify.js';
import {createRequestHook} from 'react-enty';
import {useEffect} from 'react';
import Router from '../util/router.js';
import List from '../components/List.js';

const useArtistData = createRequestHook({
    name: 'useArtistData',
    request: async (id: string) => {
        const {body} = await spotify.getArtistAlbums(id, {limit: 50});
        return {
            albums: body.items,
            artist: body.items[0].artists[0]
        };
    }
});

export default function Artist(props: {id: string}) {
    const message = useArtistData({key: props.id});
    useEffect(() => {
        if (message.isEmpty) message.request(props.id);
    }, [props.id]);

    if (message.isError) throw message.error;
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;
    const singleIndex = message.data.albums.findIndex((x) => x.album_type === 'single');

    const {albums, artist} = message.data;
    return (
        <>
            <Text bold block height={2}>
                {artist.name}
            </Text>
            <Text>
                <Text dim block>
                    Albums
                </Text>
                <Text dim y={singleIndex}>
                    Singles
                </Text>
                <Text x={8} y={0}>
                    <List
                        data={albums}
                        onChange={(next) => Router.push(next.uri)}
                        renderItem={(item) => {
                            const {name, total_tracks, release_date} = item;
                            const date = release_date.split('-')[0];
                            const details = `${total_tracks} tracks • ${date}`;
                            return (
                                <>
                                    <Text>{name}</Text>
                                    <Text x={`100%-${useChildrenSize(details).width}`}>
                                        {details}
                                    </Text>
                                </>
                            );
                        }}
                    />
                </Text>
            </Text>
        </>
    );
}
