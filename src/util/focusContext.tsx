import React, {createContext, useContext, useState} from 'react';

const FocusContext = createContext<[boolean, (next: boolean) => void]>([false, () => {}]);
const Provider = FocusContext.Provider;

export function FocusProvider(props: {children: React.ReactNode}) {
    const state = useState(false);
    return <Provider value={state} children={props.children} />;
}

export function useFocus() {
    const focus = useContext(FocusContext);
    if (!focus) throw new Error('FocusContext used before it exists');
    return focus;
}
