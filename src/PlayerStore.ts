import SpotifyWebApi from 'spotify-web-api-node';
import {proxy} from 'valtio';

const api = new SpotifyWebApi();
if (!process.env.SPOTIFY_TOKEN) throw new Error('SPOTIFY_TOKEN not found');
api.setAccessToken(process.env.SPOTIFY_TOKEN);

function timeToString(ms: number) {
    const min = Math.floor((ms / 1000 / 60) << 0);
    const sec = Math.floor((ms / 1000) % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

const player = proxy({
    playing: false,
    track: '',
    artist: '',
    album: '',
    progress: '00:00',
    progressDecimal: 0,
    duration: '00:00',
    pollCurrentlyPlaying: async () => {
        const {body} = await api.getMyCurrentPlayingTrack();
        const {progress_ms, item} = body;
        const duration = item?.duration_ms || 0;
        const progress = progress_ms || 0;

        player.playing = body.is_playing;
        player.progress = timeToString(progress);
        player.progressDecimal = progress / duration;
        player.duration = timeToString(duration);
        if (body?.item) {
            if (body.item.type === 'track') {
                const {album, artists, name} = body.item;
                player.track = name;
                player.artist = artists.map((ii) => ii.name).join(', ');
                player.album = album.name;
                return player;
            } else {
                throw new Error(`${body.item.type} not accounted for`);
            }
        }
    },
    playPause: async () => {
        const {devices} = (await api.getMyDevices()).body;
        const device = devices.find((ii) => ii.name === 'studio');
        if (!device) {
            console.error(devices);
            throw new Error('studio not found!');
        }
        const device_id = device.id ?? undefined;
        const {body} = await api.getMyCurrentPlaybackState();
        if (body.is_playing) {
            //set({playing: false});
            await api.pause({device_id});
            return;
        } else {
            //set({playing: true});
            await api.play({device_id});
            return;
        }
    }
});

export default player;
