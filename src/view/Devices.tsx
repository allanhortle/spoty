import {Box, Text, Key} from 'ink';
import {proxy, useSnapshot} from 'valtio';
import logger from '../util/logger';
import spotify from '../util/spotify';

type Device = {id: string | null; is_active: boolean; name: string; volume: number};

export const DeviceStore = proxy({
    selected: 0,
    devices: [] as Device[],
    activeDevice: null as Device | null,
    next() {
        this.selected = Math.min(this.devices.length, this.selected + 1);
    },
    prev() {
        this.selected = Math.max(0, this.selected - 1);
    },
    async fetchDevices() {
        const {body} = await spotify.getMyDevices();
        const devices = body.devices.map((ii) => ({
            id: ii.id,
            is_active: ii.is_active,
            name: ii.name,
            volume: ii.volume_percent || 0
        }));
        logger.info(devices);
        this.devices = devices;
        this.activeDevice = devices.find((ii) => ii.is_active) ?? null;
    },
    reset() {
        this.selected = 0;
        this.fetchDevices().catch(logger.error);
    },
    useInput(input: string, key: Key) {
        if (key.downArrow || input === 'j') {
            return this.next();
        }
        if (key.upArrow || input === 'k') {
            return this.prev();
        }

        //if (input === '+') return this.setVolume(10);
        //if (input === '-') return this.setVolume(-10);

        const device = this.devices[this.selected];
        if (key.return && device?.id) {
            this.activeDevice = device;
            logger.info('transfer to', device);
            spotify
                .transferMyPlayback([device.id])
                .then(() => this.fetchDevices())
                .catch(logger.error);
            return;
        }
    }
});

export default function DeviceMenu() {
    const snap = useSnapshot(DeviceStore);

    return (
        <>
            <Text bold>Devices</Text>
            {snap.devices.map((ii, index) => (
                <Box key={ii.id}>
                    <Text>{index === snap.selected ? '> ' : '  '}</Text>
                    <Text color={ii.is_active ? 'green' : undefined}>{ii.name}</Text>
                </Box>
            ))}
        </>
    );
}
