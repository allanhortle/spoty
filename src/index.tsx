import {Component, useState, useEffect} from 'react';
import {render, Box, Text, useApp, useInput} from 'ink';
import Screen from './util/Screen';
import PlayerStore from './PlayerStore';
import Player from './affordance/Player';
import useScreenSize from './util/useScreenSize';

class App extends Component {
    render() {
        //return <Counter />;
        return (
            <Screen>
                <Counter />
            </Screen>
        );
    }
}

function Counter() {
    const {exit} = useApp();
    const {width, height} = useScreenSize();

    useInput((input, key) => {
        if (input === 'q' || key.escape) {
            exit();
        }
        if (input === 'p') PlayerStore.getState().playPause();
    });

    return (
        <Box flexDirection="column" height={height}>
            <Box flexGrow={1}>
                <Text>Foo</Text>
            </Box>
            <Text wrap="truncate">{'▔'.repeat(width)}</Text>
            <Player />
        </Box>
    );
}

//const enterAltScreenCommand = '\x1b[?1049h';
//const leaveAltScreenCommand = '\x1b[?1049l';
//process.stdout.write(enterAltScreenCommand);
//process.on('exit', () => {
//process.stdout.write(leaveAltScreenCommand);
//});

render(<App />, {patchConsole: false});
