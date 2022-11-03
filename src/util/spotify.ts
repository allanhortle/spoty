import SpotifyWebApi from 'spotify-web-api-node';

const api = new SpotifyWebApi();
if (!process.env.SPOTIFY_TOKEN) throw new Error('SPOTIFY_TOKEN not found');
api.setAccessToken(process.env.SPOTIFY_TOKEN);

export default api;
