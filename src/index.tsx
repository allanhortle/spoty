#!/usr/bin/env node
import {Component} from 'react';
import logger from './util/logger.js';
import Player, {PlayerStore} from './view/Player.js';
import Search from './view/Search.js';
import Artist from './view/Artist.js';
import Album from './view/Album.js';
//import Home, {HomeStore} from './view/Home.js';
import Devices from './view/Devices.js';
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
});

function Routes() {
    //const {exit} = useApp();
    const {width} = useSize();
    logger.info({width});
    //Router.exit = exit;
    const snap = useSnapshot(Router);

    useInput((input: string) => {
        if (input === '/') Router.push('search');
        if (input === 'd') Router.push('devices');
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
                    if (route === 'devices') return <Devices />;
                    if (route.startsWith('spotify:album'))
                        return <Album id={route.split(':')[2]} />;
                    if (route.startsWith('spotify:artist'))
                        return <Artist id={route.split(':')[2]} />;
                    return <Text>Home</Text>;
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
        useExit(1);
    }
    render() {
        return this.state.error ? <Text color="red">{this.state.error.message}</Text> : <Routes />;
    }
}

(async () => {
    try {
        await initializeStorage();
        await PlayerStore.mount();
        ReactCurse.render(<App />);
    } catch (e) {
        logger.error(e);
    }
})();
