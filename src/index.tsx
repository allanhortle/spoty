#!/usr/bin/env node
import {Component, useState} from 'react';
import open from 'open';
import logger from './util/logger.js';
import Player, {PlayerStore} from './view/Player.js';
import Search from './view/Search.js';
import Artist from './view/Artist.js';
import Album from './view/Album.js';
import Devices from './view/Devices.js';
import Home from './view/Home.js';
import Help from './view/Help.js';
import {useSnapshot} from 'valtio';
import storage from './util/storage.js';
import Router from './util/router.js';
import {generateAuthUrl, refreshTokens} from './util/spotify.js';
import ReactCurse, {Text, useInput, useExit, useSize} from 'react-curse';
import {EntyProvider} from 'react-enty';
import tokenHandler from './handler/token.js';
import {FocusProvider, useFocus} from './util/focusContext.js';

function Routes() {
    const {width} = useSize();
    const [focus] = useFocus();
    const snap = useSnapshot(Router);

    useInput(
        (input: string) => {
            if (focus) return;
            if (input === '/') Router.push('search');
            if (input === 'd') Router.push('devices');
            if (input === '?') Router.push('help');
            if (input === 'h') Router.push('home');
            if (input === ' ') PlayerStore.playPause();
            if (input === 'n' && PlayerStore.albumUri) Router.push(PlayerStore.albumUri);
            if (input === 'q') {
                if (Router.current === 'home' || Router.size === 0) useExit();
                Router.pop();
            }
        },
        [focus]
    );

    return (
        <EntyProvider>
            <Text block>{'▀'.repeat(width)}</Text>
            <Text block x={2} y={2} width="100%-4" height="100%-6">
                {(() => {
                    const route = snap.route.at(-1) || 'home';
                    logger.info(route);
                    if (route === 'search') return <Search />;
                    if (route === 'devices') return <Devices />;
                    if (route === 'help') return <Help />;
                    if (route.startsWith('spotify:album'))
                        return <Album id={route.split(':')[2]} />;
                    if (route.startsWith('spotify:artist'))
                        return <Artist id={route.split(':')[2]} />;
                    return <Home />;
                })()}
            </Text>
            <Text absolute y="100%-3" block>
                {'▀'.repeat(width)}
            </Text>
            <Player />
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
        console.error(error);
    }
    render() {
        return (
            <FocusProvider>
                {this.state.error ? (
                    <Text color="red">{this.state.error.message}</Text>
                ) : (
                    <Routes />
                )}
            </FocusProvider>
        );
    }
}

function FetchTokens(props: {authUrl: string}) {
    const [once, setOnce] = useState(true);
    useInput(
        (input: string) => {
            if (input === 'q') useExit();
            if (input === '\r' && once) {
                open(props.authUrl);
                setOnce(false);
            }
        },
        [once]
    );
    return (
        <Text>
            <Text block>To use spoty you need to authorise it with spotify</Text>
            <Text block>Press return to open the browser</Text>
        </Text>
    );
}

export async function main() {
    try {
        logger.info(storage.get('tokens'));
        logger.info(new Date(storage.get('tokenTTL')));
        const authUrl = await generateAuthUrl();
        if (!storage.get('tokens')) {
            tokenHandler();
            return ReactCurse.render(<FetchTokens authUrl={authUrl} />);
        }

        await refreshTokens();

        //await initializeStorage();
        await PlayerStore.mount();
        ReactCurse.render(<App />);
    } catch (e) {
        logger.error(e);
        console.error(e);
        useExit();
    }
}

main();
