/// <reference types="spotify-api" />
import SpotifyWebApi from 'spotify-web-api-node';

const api = new SpotifyWebApi();
if (!process.env.SPOTIFY_TOKEN) throw new Error('SPOTIFY_TOKEN not found');
api.setAccessToken(process.env.SPOTIFY_TOKEN);

export default api;

export type Album = SpotifyApi.AlbumObjectFull;
export type AlbumSimple = SpotifyApi.AlbumObjectSimplified;
export type Artist = SpotifyApi.ArtistObjectFull;
export type ArtistSimple = SpotifyApi.ArtistObjectSimplified;
export type Track = SpotifyApi.TrackObjectSimplified;
