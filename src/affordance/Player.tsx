import {useEffect} from 'react';
import {Box, Text} from 'ink';
import PlayerStore from '../PlayerStore';
import useScreenSize from '../util/useScreenSize';

export default function Player() {
    const {width} = useScreenSize();
    const safeWidth = width - 12;
    const pollCurrentlyPlaying = PlayerStore((_) => _.pollCurrentlyPlaying);
    const playing = PlayerStore((_) => _.playing);
    const duration = PlayerStore((_) => _.duration);
    const progress = PlayerStore((_) => _.progress);
    const progressDecimal = PlayerStore((_) => _.progressDecimal);
    const current = PlayerStore(({track, album, artist}) => ({track, album, artist}));
    const done = Math.round((safeWidth - 3) * progressDecimal);

    useEffect(() => {
        pollCurrentlyPlaying();
        const timer = setInterval(() => {
            pollCurrentlyPlaying();
        }, 1000);

        return () => {
            clearInterval(timer);
        };
    }, []);

    return (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
            <Box justifyContent="space-between">
                <Text>
                    {current.track} - {current.artist} - {current.album}
                </Text>
                <Text>d=studio v=100%</Text>
            </Box>
            <Box justifyContent="space-between" width={width - 2}>
                <Text color={playing ? 'green' : 'yellow'}>{progress}</Text>
                <Box justifyContent="space-between">
                    <Box>
                        <Text>{'='.repeat(done)}</Text>
                        <Text>{playing ? '>' : '='}</Text>
                    </Box>
                    <Text>{'.'.repeat(safeWidth - 3 - done)}</Text>
                </Box>
                <Text>{duration}</Text>
            </Box>
        </Box>
    );
}
