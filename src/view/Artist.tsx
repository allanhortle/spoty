import {useChildrenSize, Spinner, Text} from 'react-curse';
import {fetchArtist, ArtistInfo} from '../util/spclient.js';
import {createRequestHook} from 'react-enty';
import {useEffect} from 'react';
import logger from '../util/logger.js';
import Router from '../util/router.js';
import List from '../components/List.js';

const useArtistData = createRequestHook({
    name: 'useArtistData',
    request: async (id: string) => {
        const artist = await fetchArtist(`spotify:artist:${id}`);
        if (!artist) throw new Error('Artist not found');
        return {artist};
    }
});

export default function Artist(props: {id: string}) {
    const message = useArtistData({key: props.id});
    useEffect(() => {
        if (message.isEmpty) message.request(props.id);
    }, [props.id]);

    // Same lesson as Search/Home: a failed fetch must not kill the TUI.
    if (message.isError) {
        logger.error(message.error);
        return (
            <Text dim block>
                Artist failed — try again (see ~/Library/Logs/spoty-nodejs/spoty.log)
            </Text>
        );
    }
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    const {artist} = message.data as {artist: ArtistInfo};
    return (
        <>
            <Text bold block height={2}>
                {artist.name}
            </Text>
            <Text>
                <Text dim block>
                    Albums
                </Text>
                <Text dim y={artist.singlesStart}>
                    Singles
                </Text>
                <Text x={8} y={0}>
                    <List
                        data={artist.albums}
                        onChange={(next) => Router.push(next.uri)}
                        renderItem={(item) => {
                            const {name, year, trackCount} = item as ArtistInfo['albums'][number];
                            const details = year
                                ? `${trackCount} tracks • ${year}`
                                : `${trackCount} tracks`;
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
