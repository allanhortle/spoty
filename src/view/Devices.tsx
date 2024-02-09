import spotify from '../util/spotify.js';
import {Router} from '../index.js';
import {ArraySchema, EntitySchema, createRequestHook} from 'react-enty';
import {useEffect} from 'react';
import {List, Spinner, Text} from 'react-curse';

type Device = {id: string | null; active: boolean; name: string; volume: number};

const deviceSchema = new EntitySchema('device');

const useDeviceData = createRequestHook({
    name: 'useDeviceData',
    schema: new ArraySchema(deviceSchema),
    request: async () => {
        const {body} = await spotify.getMyDevices();
        const devices: Device[] = body.devices.map((ii) => ({
            id: ii.id,
            active: ii.is_active,
            name: ii.name,
            volume: ii.volume_percent || 0
        }));
        return devices;
    }
});

const useTransferPlayback = createRequestHook({
    name: 'transferPlayback',
    schema: new ArraySchema(deviceSchema),
    request: async (id: string) => {
        await spotify.transferMyPlayback([id]);
    }
});

export default function DeviceMenu() {
    const message = useDeviceData();
    const transfer = useTransferPlayback();
    useEffect(() => {
        if (message.isEmpty) message.request();
    }, []);

    useEffect(() => {
        if (transfer.isSuccess) Router.pop();
    }, [transfer.isSuccess]);

    if (message.isError) throw message.error;
    if (message.isEmpty || message.isPending) return <Spinner color="white" />;

    return (
        <>
            <Text block bold height={2}>
                Devices
            </Text>
            <List
                data={message.data}
                onSubmit={(next: {y: number}) => {
                    const id = message.data[next.y].id;
                    if (id) transfer.request(id);
                }}
                renderItem={({item, selected}: {item: Device; selected: boolean}) => {
                    return (
                        <Text color={item.active ? 'green' : undefined} width="100%-2">
                            <Text>{selected ? (transfer.isPending ? '~ ' : '> ') : '  '}</Text>
                            <Text>{item.name}</Text>
                        </Text>
                    );
                }}
            />
        </>
    );
}
