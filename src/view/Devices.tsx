import {useSnapshot} from 'valtio';
import {List, Text} from 'react-curse';
import {PlayerStore, Device} from './Player.js';

export default function Devices() {
    const snap = useSnapshot(PlayerStore);
    return (
        <>
            <Text block bold height={2}>
                Devices
            </Text>
            <List
                data={snap.devices}
                onSubmit={(next: {y: number}) => {
                    const device = snap.devices[next.y];
                    if (device) PlayerStore.selectDevice(device);
                }}
                renderItem={({item, selected}: {item: Device; selected: boolean}) => {
                    return (
                        <Text
                            color={item.id === snap.activeDevice?.id ? 'green' : undefined}
                            width="100%-2"
                        >
                            <Text>{selected ? '> ' : '  '}</Text>
                            <Text>{item.name}</Text>
                        </Text>
                    );
                }}
            />
        </>
    );
}
