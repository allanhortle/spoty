import SpotifyWebApi from 'spotify-web-api-node';
import create from 'zustand';

const api = new SpotifyWebApi();
if (!process.env.SPOTIFY_TOKEN) throw new Error('SPOTIFY_TOKEN not found');
api.setAccessToken(process.env.SPOTIFY_TOKEN);

type PlayerStore = {
    playing: boolean;
    track: string;
    artist: string;
    album: string;
    progress: string;
    duration: string;
    progressDecimal: number;
    playPause: () => Promise<void>;
    pollCurrentlyPlaying: () => Promise<void>;
};

function timeToString(ms: number) {
    const min = Math.floor((ms / 1000 / 60) << 0);
    const sec = Math.floor((ms / 1000) % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export default create<PlayerStore>((set) => ({
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
        console.log(body);
        set({
            playing: body.is_playing,
            progress: timeToString(progress),
            progressDecimal: progress / duration,
            duration: timeToString(duration)
        });
        if (body?.item) {
            if (body.item.type === 'track') {
                const {album, artists, name} = body.item;
                set({
                    track: name,
                    artist: artists.map((ii) => ii.name).join(', '),
                    album: album.name
                });
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
}));
