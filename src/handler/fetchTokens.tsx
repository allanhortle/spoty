import {Hono} from 'hono';
import ReactCurse from 'react-curse';
import {serve, type HttpBindings} from '@hono/node-server';
import {convertCodeToAccessToken, generateAuthUrl} from '../util/spotify.js';
import logger from '../util/logger.js';
import startApp from './startApp.js';
import TokenSplash from '../view/TokenSplash.js';

type Bindings = HttpBindings & {
    /* ... */
};

const app = new Hono<{Bindings: Bindings}>();

app.get('/token', async (c) => {
    logger.info({code: c.req.query('code'), state: c.req.query('state')});
    try {
        await convertCodeToAccessToken(c.req.query('code'), c.req.query('state'));
        startApp();
        return c.text('Token saved! You can close this window and go back to the terminal');
    } catch (e) {
        logger.error(e);
        return c.text('Something went wrong converting the grant to a token');
    }
});

export default async function tokenHandler() {
    const authUrl = await generateAuthUrl();
    serve({fetch: app.fetch, port: 15298});
    return ReactCurse.render(<TokenSplash authUrl={authUrl} />);
}
