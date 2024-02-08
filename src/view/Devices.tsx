import {Box, Text, Key} from 'ink';
import {proxy, useSnapshot} from 'valtio';
import logger from '../util/logger';
import spotify from '../util/spotify';
import {Router} from '../index';

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
        logger.info(body);
        const devices = body.devices.map((ii) => ({
            id: ii.id,
            is_active: ii.is_active,
            name: ii.name,
            volume: ii.volume_percent || 0
        }));
        logger.info(devices.map((ii) => `${ii.name}=${ii.is_active}`));
        this.devices = devices;
        this.activeDevice = devices.find((ii) => ii.is_active) ?? null;
    },
    async mount() {
        await this.fetchDevices();
        if (this.devices.length === 1) {
            this.activeDevice = this.devices[0];
        }
        if (this.activeDevice?.id) {
            spotify.transferMyPlayback([this.activeDevice?.id]);
        }
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
            logger.info(`transfer to: ${device.name}`);
            spotify.transferMyPlayback([device.id]).catch(logger.error);
            Router.pop();
            return;
        }
    }
});

export default function DeviceMenu() {
    const snap = useSnapshot(DeviceStore);

    return (
        <>
            <Box marginBottom={1}>
                <Text bold>Devices</Text>
            </Box>
            {snap.devices.map((ii, index) => (
                <Box key={ii.id}>
                    <Text>{index === snap.selected ? '> ' : '  '}</Text>
                    <Text color={ii.id === snap.activeDevice?.id ? 'green' : undefined}>
                        {ii.name}
                    </Text>
                </Box>
            ))}
        </>
    );
}
