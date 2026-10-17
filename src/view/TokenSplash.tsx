import {useState} from 'react';
import open from 'open';
import {Text, useExit, useInput} from 'react-curse';

export default function TokenSplash(props: {code?: string; url?: string; error?: string}) {
    const [once, setOnce] = useState(true);
    useInput(
        (input: string) => {
            if (input === 'q') useExit();
            if (input === '\r' && once && props.url) {
                open(props.url);
                setOnce(false);
            }
        },
        [once]
    );

    if (props.error) {
        return (
            <Text>
                <Text block color="red">
                    Couldn't start spoty: {props.error}
                </Text>
                <Text block dim>
                    Press q to quit
                </Text>
            </Text>
        );
    }

    return (
        <Text>
            <Text block>To use spoty you need to pair it with your Spotify account</Text>
            <Text block dim>
                Press return to open spotify.com/pair
            </Text>
            <Text block>{' '}</Text>
            <Text block bold>
                Pairing code: {props.code}
            </Text>
            <Text block>{' '}</Text>
            <Text block>Waiting for approval…</Text>
            <Text block dim>
                Press q to quit
            </Text>
        </Text>
    );
}
