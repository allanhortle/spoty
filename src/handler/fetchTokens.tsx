import ReactCurse from 'react-curse';
import {pollForPairing, requestPairingCode} from '../util/spotify.js';
import logger from '../util/logger.js';
import startApp from './startApp.js';
import TokenSplash from '../view/TokenSplash.js';

function describeError(e: unknown): string {
    // spotify-web-api-node throws WebapiError, whose message is the useless
    // "[object Object]"; its useful bits are statusCode and body.
    const statusCode = (e as {statusCode?: number} | null)?.statusCode;
    if (statusCode === 429) {
        return 'Spotify is rate limiting us (HTTP 429) — wait a minute, then run spoty again';
    }
    if (statusCode) {
        return `Spotify returned HTTP ${statusCode}`;
    }
    if (e instanceof Error && e.message && e.message !== '[object Object]') {
        return e.message;
    }
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

export default async function tokenHandler() {
    const pairing = await requestPairingCode();

    // Spotify shows a code at spotify.com/pair; once the user approves it there,
    // the poll resolves and we boot the app. No port to listen on.
    pollForPairing(pairing.deviceCode, pairing.interval)
        .then(() => startApp())
        .catch((e: unknown) => {
            logger.error(e);
            // Note: the pairing itself may have succeeded (tokens are stored),
            // so this is usually a boot problem, not a login one.
            ReactCurse.render(<TokenSplash error={describeError(e)} />);
        });

    return ReactCurse.render(<TokenSplash code={pairing.userCode} url={pairing.verificationUrl} />);
}
