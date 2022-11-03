import {Component, Suspense, useEffect} from 'react';
import {render, Box, Text, useApp, useInput, Key} from 'ink';
import Screen from './util/Screen';
import Player, {PlayerStore} from './view/Player';
import Search, {SearchStore} from './view/Search';
import Devices, {DeviceStore} from './view/Devices';
import useScreenSize from './util/useScreenSize';
import logger from './util/logger';
import {proxy, useSnapshot} from 'valtio';

DeviceStore.fetchDevices();

const viewManager = proxy({
    search: false,
    devices: false,
    view: null,

    useInput(input: string, key: Key) {
        if (input === 'p') PlayerStore.playPause();
        if (input === '/') {
            this.devices = false;
            this.search = true;
            SearchStore.reset();
        }
        if (input === 'd' && !this.search) {
            this.search = false;
            this.devices = !this.devices;
            DeviceStore.reset();
        }

        if (this.search) {
            if (key.escape) this.search = false;
            return SearchStore.useInput(input, key);
        }
        if (this.devices) {
            if (key.escape) this.devices = false;
            return DeviceStore.useInput(input, key);
        }
    }
});

function SpotifyPlayer() {
    const {exit} = useApp();
    const {width, height} = useScreenSize();
    const snap = useSnapshot(viewManager);

    useInput((input, key) => {
        if (input === 'q') exit();
        viewManager.useInput(input, key);
    });

    useEffect(() => {
        PlayerStore.pollCurrentlyPlaying();
        const timer = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 500);

        return () => {
            clearInterval(timer);
        };
    }, []);

    return (
        <Box flexDirection="column" height={height}>
            {(snap.devices || snap.search) && (
                <Box flexDirection="column">
                    <Box flexDirection="column" paddingX={1}>
                        {snap.devices && <Devices />}
                        {snap.search && <Search />}
                    </Box>
                    <Text wrap="truncate">{'▄'.repeat(width)}</Text>
                </Box>
            )}
            <Box flexGrow={1}></Box>
            <Text wrap="truncate">{'▔'.repeat(width)}</Text>
            <Player />
        </Box>
    );
}

class App extends Component {
    componentDidCatch(e: Error) {
        logger.error(e);
    }
    render() {
        return (
            <Suspense>
                <Screen>
                    <SpotifyPlayer />
                </Screen>
            </Suspense>
        );
    }
}

try {
    render(<App />, {patchConsole: false});
} catch (e) {
    logger.error(e);
}
