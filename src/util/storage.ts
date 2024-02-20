import Conf from 'conf';
import {Tokens} from './spotify.js';

const storage = new Conf<{tokens: Tokens}>({projectName: 'spoty'});

export default storage;
