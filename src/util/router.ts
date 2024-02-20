import {proxy} from 'valtio';
import logger from './logger.js';

export default proxy({
    route: [process.argv[2] ?? 'home'] as string[],
    exit: () => {},
    get size() {
        return this.route.length;
    },
    get current() {
        return this.route.at(-1);
    },
    push(route: string) {
        if (this.route.at(-1) !== route) {
            this.route.push(route);
        }
    },
    replace(route: string) {
        if (this.route.at(-1) !== route) {
            this.route[this.route.length - 1] = route;
        }
    },
    pop() {
        this.route.pop();
        logger.info({route: this.route});
    }
});
