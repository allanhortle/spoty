import {List as CursesList, Text} from 'react-curse';
export default function List<T>(props: {
    data: Array<T>;
    onChange: (next: T) => void;
    renderItem: (p: T) => Text;
    loading?: boolean;
    focus?: boolean;
}) {
    return (
        <CursesList
            block
            focus={props.focus}
            data={props.data}
            onSubmit={(next: {y: number}) => props.onChange(props.data[next.y])}
            renderItem={({item, selected}: {item: T; selected: boolean}) => {
                return (
                    <Text>
                        <Text>{selected ? (props.loading ? '~ ' : '> ') : '  '}</Text>
                        {props.renderItem(item)}
                    </Text>
                );
            }}
        />
    );
}
