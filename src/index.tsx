import {Component, Suspense, useEffect} from 'react';
import {render, Box, Text, useApp, useInput, Key} from 'ink';
import Screen from './util/Screen';
import Player, {PlayerStore} from './view/Player';
import Search, {SearchStore} from './view/Search';
import Artist, {ArtistStore} from './view/Artist';
import Album, {AlbumStore} from './view/Album';
import Devices, {DeviceStore} from './view/Devices';
import useScreenSize from './util/useScreenSize';
import logger from './util/logger';
import {proxy, useSnapshot} from 'valtio';

DeviceStore.fetchDevices();

export const Router = proxy({
    route: [] as string[],
    exit: () => {},

    push(route: string) {
        if (this.route.at(-1) !== route) {
            this.route.push(route);
            this.mount(route);
        }
    },
    replace(route: string) {
        if (this.route.at(-1) !== route) {
            this.route[this.route.length - 1] = route;
            this.mount(route);
        }
    },
    pop() {
        this.route.pop();
        logger.info('pop', this.route);
    },
    mount(route: string) {
        if (route.includes('artist')) {
            ArtistStore.mount(route.split(':')[2]);
        }
        if (route.includes('album')) {
            AlbumStore.mount(route.split(':')[2]);
        }
    },
    useInput(input: string, key: Key) {
        const route = this.route.at(-1) || '';
        if (key.escape) this.pop();
        if (input === 'q') this.route.length ? this.pop() : this.exit();
        if (input === 'p') PlayerStore.playPause();
        if (input === '/') {
            this.push('search');
            SearchStore.reset();
        }
        if (input === 'd' && route !== 'search') {
            this.push('devices');
            DeviceStore.reset();
        }

        if (route === 'search') return SearchStore.useInput(input, key);
        if (route.includes('artist')) return ArtistStore.useInput(input, key);
        if (route.includes('album')) return AlbumStore.useInput(input, key);
        if (route === 'devices') return DeviceStore.useInput(input, key);
    }
});

Router.mount(Router.route.at(-1) || 'home');

function SpotifyPlayer() {
    const {exit} = useApp();
    const {width} = useScreenSize();
    Router.exit = exit;
    const snap = useSnapshot(Router);

    useInput((input, key) => {
        Router.useInput(input, key);
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
        <Box flexDirection="column">
            <Text wrap="truncate">{'▀'.repeat(width)}</Text>
            <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
                {(() => {
                    const route = snap.route.at(-1) || 'home';
                    if (route === 'search') return <Search />;
                    if (route === 'devices') return <Devices />;
                    if (route.startsWith('spotify:album')) return <Album />;
                    if (route.startsWith('spotify:artist')) return <Artist />;
                    return <Text>Home</Text>;
                })()}
            </Box>
            <Text wrap="truncate">{'▀'.repeat(width)}</Text>
            <Player />
        </Box>
    );
}

class App extends Component {
    componentDidCatch(e: Error) {
        logger.error(e.message);
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
    render(<App />);
} catch (e) {
    logger.error(e);
}
