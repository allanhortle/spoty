import {useState} from 'react';
import open from 'open';
import {Text, useExit, useInput} from 'react-curse';

export default function TokenSplash(props: {authUrl: string}) {
    const [once, setOnce] = useState(true);
    useInput(
        (input: string) => {
            if (input === 'q') useExit();
            if (input === '\r' && once) {
                open(props.authUrl);
                setOnce(false);
            }
        },
        [once]
    );
    return (
        <Text>
            <Text block>To use spoty you need to authorise it with spotify</Text>
            <Text block>Press return to open the browser</Text>
        </Text>
    );
}
