import {Text, Input, useInput, Spinner} from 'react-curse';
import spotify from '../util/spotify.js';
import Router from '../util/router.js';
import {useEffect, useState} from 'react';
import {createRequestHook} from 'react-enty';
import {useFocus} from '../util/focusContext.js';
import List from '../components/List.js';

const useSearchData = createRequestHook({
    name: 'search',
    request: async ({query, type}: {query: string; type: 'album' | 'artist'}) => {
        const {body} = await spotify.search(query, [type], {limit: 20});
        const albums = (body.albums?.items || []).map(({name, type, uri, artists}) => ({
            name,
            type,
            uri,
            artist: artists.map((ii) => ii.name).join(', ')
        }));
        const artists = (body.artists?.items || []).map(({name, type, uri}) => ({
            name,
            type,
            uri,
            artist: name
        }));
        return [...artists, ...albums];
    }
});

export default function Search() {
    const [type, setType] = useState<'album' | 'artist'>('artist');
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useFocus();
    const searchData = useSearchData({key: type});

    useEffect(() => {
        setFocus(true);
    }, []);

    useInput(
        (key: string) => {
            if (key === '\t') {
                setType((next) => (next === 'album' ? 'artist' : 'album'));
                setFocus(true);
            }

            if (key === '/') setFocus(true);
            if (key === '\r' && focus) {
                searchData.request({query, type});
                setFocus(false);
            }
        },
        [query, type, focus, searchData.isSuccess]
    );

    if (searchData.isError) throw searchData.error;

    return (
        <>
            <Text>
                <Text bold>Search: </Text>
                <Input value={query} onChange={setQuery} focus={focus} />
            </Text>
            <Text x="100%-12" block>
                <Text color={type === 'album' ? 'yellow' : undefined}>album</Text>
                <Text> </Text>
                <Text color={type === 'artist' ? 'yellow' : undefined}>artist</Text>
            </Text>
            <Text block />
            {searchData.isPending ? (
                <Spinner color="white" absolute></Spinner>
            ) : (
                <List
                    focus={!focus && searchData.isSuccess}
                    data={searchData.data ?? []}
                    onChange={(next) => {
                        Router.replace(next.uri);
                    }}
                    renderItem={(item) => (
                        <Text wrap="truncate">
                            {type === 'album' ? `${item.name} - ${item.artist}` : item.name}
                        </Text>
                    )}
                />
            )}
        </>
    );
}
