import {Component, Suspense, useState} from 'react';
import {render, Box, Text, useApp, useInput} from 'ink';
import Screen from './util/Screen';
import PlayerStore from './PlayerStore';
import Player from './affordance/Player';
import useScreenSize from './util/useScreenSize';
import TextInput from 'ink-text-input';

class App extends Component {
    render() {
        return (
            <Suspense>
                <Screen>
                    <Counter />
                </Screen>
            </Suspense>
        );
    }
}

function Counter() {
    const {exit} = useApp();
    const {width, height} = useScreenSize();
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState(false);

    useInput((input, key) => {
        if (input === 'q') {
            exit();
        }
        if (input === 'p') PlayerStore.playPause();
        if (input === '/') setSearch(!search);
        if (search && key.escape) setSearch(false);
    });

    return (
        <Box flexDirection="column" height={height}>
            {search && (
                <Box flexDirection="column">
                    <Box>
                        <Text>Search: </Text>
                        <TextInput value={query} onChange={setQuery} />
                    </Box>
                    <Text wrap="truncate">{'▁'.repeat(width)}</Text>
                </Box>
            )}
            <Box flexGrow={1}></Box>
            <Text wrap="truncate">{'▔'.repeat(width)}</Text>
            <Player />
        </Box>
    );
}

try {
    render(<App />, {patchConsole: false});
} catch (e) {
    console.log(e);
}
