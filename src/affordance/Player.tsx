import {useEffect} from 'react';
import {Box, Text} from 'ink';
import PlayerStore from '../PlayerStore';
import useScreenSize from '../util/useScreenSize';
import {useSnapshot} from 'valtio';

export default function Player() {
    const {width} = useScreenSize();
    const snap = useSnapshot(PlayerStore);

    const safeWidth = width - 12;
    const done = Math.round((safeWidth - 3) * snap.progressDecimal);

    useEffect(() => {
        PlayerStore.pollCurrentlyPlaying();
        const timer = setInterval(() => {
            PlayerStore.pollCurrentlyPlaying();
        }, 1000);

        return () => {
            clearInterval(timer);
        };
    }, []);

    return (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
            <Box justifyContent="space-between">
                <Text>
                    {snap.track} - {snap.artist} - {snap.album}
                </Text>
                <Text>d=studio v=100%</Text>
            </Box>
            <Box justifyContent="space-between" width={width - 2}>
                <Text color={snap.playing ? 'green' : 'yellow'}>{snap.progress}</Text>
                <Box justifyContent="space-between">
                    <Box>
                        <Text>{'='.repeat(done)}</Text>
                        <Text>{snap.playing ? '>' : '='}</Text>
                    </Box>
                    <Text>{'.'.repeat(safeWidth - 3 - done)}</Text>
                </Box>
                <Text>{snap.duration}</Text>
            </Box>
        </Box>
    );
}
