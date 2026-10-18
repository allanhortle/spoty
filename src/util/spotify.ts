import storage from './storage.js';

export type Tokens = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
};

// Spotify's own desktop client id (librespot's "keymaster"). Pairing with it
// yields first-party tokens, so the Web API treats spoty like the official
// app rather than a restricted developer app. No client secret, no developer
// app registration, no callback server.
const clientId = '65b708073fc0480ea92a077233ca87bd';
export {clientId};
const scopes = [
    'user-top-read',
    'user-read-playback-position',
    'user-read-recently-played',
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state',
    'user-library-modify',
    'user-library-read',
    'app-remote-control',
    'user-follow-read',
    'playlist-read-collaborative',
    'playlist-read-private'
];

export type Pairing = {
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    interval: number;
};

export async function requestPairingCode(): Promise<Pairing> {
    const response = await fetch('https://accounts.spotify.com/oauth2/device/authorize', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: clientId, scope: scopes.join(' ')})
    });
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body.error_description ?? body.error ?? 'Pairing request failed');
    }
    return {
        deviceCode: body.device_code,
        userCode: body.user_code,
        verificationUrl: body.verification_uri_complete ?? body.verification_uri,
        interval: body.interval ?? 5
    };
}

export async function pollForPairing(deviceCode: string, interval = 5): Promise<Tokens> {
    for (;;) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: deviceCode
            })
        });
        const body = await response.json();

        if (response.ok) {
            saveTokens(body);
            return body;
        }
        if (body.error === 'authorization_pending') continue;
        if (body.error === 'slow_down') {
            interval += 5;
            continue;
        }
        // access_denied, expired_token or anything unexpected
        throw new Error(body.error_description ?? body.error ?? 'Pairing failed');
    }
}

export function saveTokens(tokens: Tokens) {
    storage.set('tokenTTL', Date.now() + tokens.expires_in * 1000);
    return storage.set('tokens', tokens);
}

export async function refreshTokens() {
    const {refresh_token} = storage.get('tokens');

    // refresh token that has been previously stored
    const url = 'https://accounts.spotify.com/api/token';

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token,
            client_id: clientId
        })
    };
    const body = await fetch(url, payload);
    const response = await body.json();
    if (!response.access_token) {
        // The stored refresh token is dead (expired, revoked, or left over
        // from the old developer-app login). Clear it so the app falls back
        // to pairing instead of limping along with a stale token.
        storage.delete('tokens');
        storage.delete('tokenTTL');
        throw new Error(response.error_description ?? response.error ?? 'Token refresh failed');
    }
    saveTokens(response);
}
