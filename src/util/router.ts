import {proxy} from 'valtio';

export default proxy({
    route: [process.argv[2]] as string[],
    exit: () => {},
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
    }
});
