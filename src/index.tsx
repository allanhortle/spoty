#!/usr/bin/env node
import {Component} from 'react';
import logger from './util/logger.js';
//import {render, Box, Text, useApp, useInput, Key} from 'ink';
//import Screen from './util/Screen.js';
//import Player, {PlayerStore} from './view/Player.js';
import Search from './view/Search.js';
import Artist from './view/Artist.js';
//import Album, {AlbumStore} from './view/Album.js';
//import Home, {HomeStore} from './view/Home.js';
//import Devices, {DeviceStore} from './view/Devices.js';
//import useScreenSize from './util/useScreenSize.js';
import {proxy, useSnapshot} from 'valtio';
import {initializeStorage} from './util/storage.js';
import ReactCurse, {Text, useInput, useExit, useSize} from 'react-curse';
import {EntyProvider} from 'react-enty';

export const Router = proxy({
    route: [process.argv[2]] as string[],
    exit: () => {},

    push(route: string) {
        if (this.route.at(-1) !== route) {
            //this.mount(route);
            this.route.push(route);
        }
    },
    replace(route: string) {
        if (this.route.at(-1) !== route) {
            //this.mount(route);
            this.route[this.route.length - 1] = route;
        }
    },
    pop() {
        this.route.pop();
        logger.info('pop', this.route);
    }
    //mount(route: string) {
    //if (route.includes('artist')) return ArtistStore.mount(route.split(':')[2]);
    //if (route.includes('album')) return AlbumStore.mount(route.split(':')[2]);
    //if (route === 'home') return HomeStore.mount();
    //if (route === 'search') return SearchStore.mount();
    //if (route === 'devices') return DeviceStore.mount();
    //},
    //useInput(input: string, key: Key) {
    //const route = this.route.at(-1) || '';
    //if (key.escape) this.pop();
    //if (input === '/') this.push('search');
    //if (!SearchStore.focus) {
    //if (input === 'q') this.route.length > 1 ? this.pop() : this.exit();
    //if (input === 'p') PlayerStore.playPause();
    //if (input === 'h') this.route = ['home'];
    //if (input === 'd') this.push('devices');
    //}

    //if (route === 'search') return SearchStore.useInput(input, key);
    //if (route.includes('artist')) return ArtistStore.useInput(input, key);
    //if (route.includes('album')) return AlbumStore.useInput(input, key);
    //if (route === 'devices') return DeviceStore.useInput(input, key);
    //return HomeStore.useInput(input, key);
    //}
});

function Routes() {
    //const {exit} = useApp();
    const {width} = useSize();
    //Router.exit = exit;
    const snap = useSnapshot(Router);

    useInput((input: string) => {
        if (input === '/') Router.push('search');
        if (input === 'q') Router.route.length > 1 ? Router.pop() : useExit();
    });

    return (
        <EntyProvider>
            <Text block>{'▀'.repeat(width)}</Text>
            <Text block x={2} y={2} width="100%-4" height="100%-6">
                {(() => {
                    const route = snap.route.at(-1) || 'home';
                    logger.info(route);
                    if (route === 'search') return <Search />;
                    //if (route === 'devices') return <Devices />;
                    //if (route.startsWith('spotify:album')) return <Album />;
                    if (route.startsWith('spotify:artist')) return <Artist uri={route} />;
                    //if (route === 'devices') return <Devices />;
                    //if (route.startsWith('spotify:album')) return <Album />;
                    //if (route.startsWith('spotify:artist')) return <Artist />;
                    return <Text>Home</Text>;
                })()}
            </Text>
            <Text absolute y="100%-3">
                {'▀'.repeat(width)}
            </Text>
        </EntyProvider>
    );
}

export default class App extends Component<{}, {error: Error | null}> {
    constructor(props: {}) {
        super(props);
        this.state = {error: null};
    }

    componentDidCatch(error: Error) {
        logger.error(error);
        this.setState({error});
        useExit(1);
    }
    render() {
        return this.state.error ? <Text color="red">{this.state.error.message}</Text> : <Routes />;
    }
}

(async () => {
    try {
        await initializeStorage();
        ReactCurse.render(<App />);
    } catch (e) {
        logger.error(e);
    }
})();
