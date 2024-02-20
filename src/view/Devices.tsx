import {useSnapshot} from 'valtio';
import {Text} from 'react-curse';
import {PlayerStore} from './Player.js';
import List from '../components/List.js';

export default function Devices() {
    const snap = useSnapshot(PlayerStore);
    return (
        <>
            <Text block bold height={2}>
                Devices
            </Text>
            <List
                data={snap.devices}
                onChange={(device) => {
                    if (device) PlayerStore.selectDevice(device);
                }}
                renderItem={(item) => {
                    return (
                        <Text color={item.id === snap.activeDevice?.id ? 'green' : undefined}>
                            {item.name}
                        </Text>
                    );
                }}
            />
        </>
    );
}
