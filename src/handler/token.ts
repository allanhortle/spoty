import {Hono} from 'hono';
import {serve, type HttpBindings} from '@hono/node-server';
import {convertCodeToAccessToken} from '../util/spotify.js';
import logger from '../util/logger.js';
import {main} from '../index.js';

type Bindings = HttpBindings & {
    /* ... */
};

const app = new Hono<{Bindings: Bindings}>();

app.get('/token', async (c) => {
    logger.info({code: c.req.query('code'), state: c.req.query('state')});
    try {
        await convertCodeToAccessToken(c.req.query('code'), c.req.query('state'));
        main();
        return c.text('Token saved! You can close this windw and go back to the terminal');
    } catch (e) {
        logger.error(e);
        return c.text('Something went wrong converting the grant to a token');
    }
});

export default function tokenHandler() {
    serve({fetch: app.fetch, port: 15298});
}
