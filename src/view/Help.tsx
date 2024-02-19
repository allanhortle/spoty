import {Text} from 'react-curse';

export default function Help() {
    return (
        <Text>
            <Text bold height={2} block>
                Navigation
            </Text>
            <HelpRow hotkey="n">Now Playing</HelpRow>
            <HelpRow hotkey="?">Help</HelpRow>
            <HelpRow hotkey="/">Search</HelpRow>
            <HelpRow hotkey="d">Devices</HelpRow>
            <HelpRow hotkey="q">Go back</HelpRow>

            <Text bold height={4} block>
                <Text block />
                <Text block />
                Controls
            </Text>
            <HelpRow hotkey="space">Play/Pause</HelpRow>
        </Text>
    );
}

function HelpRow(props: {hotkey: string; children: React.ReactNode}) {
    return (
        <Text block>
            {props.hotkey} <Text color="yellow">{props.children}</Text>
        </Text>
    );
}
