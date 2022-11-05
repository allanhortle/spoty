import {useEffect, useMemo} from 'react';
import {Box, useStdout, useInput} from 'ink';

import useScreenSize from './useScreenSize';

const Screen = ({children}: {children?: any}) => {
    const {height, width} = useScreenSize();
    const {stdout} = useStdout();
    if (!stdout) throw new Error('stdout not found');

    useMemo(() => stdout.write('\x1b[?1049h'), [stdout]);
    useEffect(() => {
        return () => {
            stdout.write('\x1b[?1049l');
        };
    }, [stdout]);
    useInput(() => {});

    return (
        <Box height={height} width={width}>
            {children}
        </Box>
    );
};

export default Screen;
