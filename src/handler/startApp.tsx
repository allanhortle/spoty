import App from '../index.js';
import {refreshTokens} from '../util/spotify.js';
import {PlayerStore} from '../view/Player.js';
import ReactCurse from 'react-curse';

export default async function startApp() {
    await refreshTokens();
    await PlayerStore.mount();
    ReactCurse.render(<App />);
}
