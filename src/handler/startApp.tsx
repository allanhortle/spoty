import App from '../index.js';
import {refreshTokens} from '../util/spotify.js';
import {PlayerStore} from '../view/Player.js';
import ReactCurse from 'react-curse';

export default async function startApp() {
    await refreshTokens();
    // mount fetches the device list with its own retries; render immediately
    // and let the store update when Spotify answers.
    PlayerStore.mount();
    ReactCurse.render(<App />);
}
