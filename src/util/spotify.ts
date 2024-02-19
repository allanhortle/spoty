/// <reference types="spotify-api" />
import SpotifyWebApi from 'spotify-web-api-node';
import storage from './storage.js';
import {webcrypto} from 'crypto';
import logger from './logger.js';

export type Tokens = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
};
const clientId = '294a411559ca49d3ac08b12e5de384eb';
const redirectUri = 'http://localhost:15298/token';
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

const api = new SpotifyWebApi({clientId, redirectUri});

export async function generateAuthUrl() {
    const generateRandomString = (length: number) => {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    };

    const codeVerifier = generateRandomString(64);

    const sha256 = async (plain: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return webcrypto.subtle.digest('SHA-256', data);
    };

    const base64encode = (input: ArrayBuffer) => {
        return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };

    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: scopes.join(' '),
        state: codeVerifier,
        show_dialogue: 'false',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri
    }).toString();

    return authUrl.toString();
}

export const authUrl = api.createAuthorizeURL(scopes, '');

export async function convertCodeToAccessToken(code?: string, state?: string) {
    if (!code) throw new Error('Code was not found');
    if (!state) throw new Error('State was not found');

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: state
        })
    };

    const body = await fetch('https://accounts.spotify.com/api/token', payload);
    const response = await body.json();
    logger.info(response);
    saveTokens(response);
}

export function saveTokens(tokens: Tokens) {
    api.setAccessToken(tokens.access_token);
    api.setRefreshToken(tokens.refresh_token);
    storage.set('tokenTTL', Date.now() + tokens.expires_in * 1000);
    return storage.set('tokens', tokens);
}

export function getTokens() {
    const tokens = storage.get('tokens');
    api.setAccessToken(tokens.access_token);
    api.setRefreshToken(tokens.refresh_token);
    return tokens;
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
    saveTokens(response);
}

export default api;

export type Album = SpotifyApi.AlbumObjectFull;
export type AlbumSimple = SpotifyApi.AlbumObjectSimplified;
export type Artist = SpotifyApi.ArtistObjectFull;
export type ArtistSimple = SpotifyApi.ArtistObjectSimplified;
export type Track = SpotifyApi.TrackObjectSimplified;
