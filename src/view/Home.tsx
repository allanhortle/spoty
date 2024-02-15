//import {Box, Text, Key} from 'ink';
//import {proxy, useSnapshot} from 'valtio';
//import spotify, {ArtistSimple} from '../util/spotify';

//export const HomeStore = proxy({
//selected: 0,
//short_term: [] as ArtistSimple[],
//medium_term: [] as ArtistSimple[],
//long_term: [] as ArtistSimple[],
//next() {
//this.selected = (this.selected + 1) % this.short_term.length;
//},
//prev() {
//const next = this.selected - 1;
//this.selected = next === -1 ? this.short_term.length - 1 : next;
//},
//async mount() {
//const {body: short_term} = await spotify.getMyTopArtists({time_range: 'short_term'});
//const {body: medium_term} = await spotify.getMyTopArtists({time_range: 'medium_term'});
//const {body: long_term} = await spotify.getMyTopArtists({time_range: 'long_term'});
//this.short_term = short_term.items;
//this.medium_term = medium_term.items;
//this.long_term = long_term.items;
//},
//useInput(input: string, key: Key) {
//if (key.downArrow || input === 'j') return this.next();
//if (key.upArrow || input === 'k') return this.prev();
//}
//});

//export default function Home() {
//const snap = useSnapshot(HomeStore);
//if (!snap.short_term.length) return null;

//return (
//<Box>
//<Box flexDirection="column" flexGrow={1}>
//<Box marginBottom={1}>
//<Text bold>Recent Artists</Text>
//</Box>
//{snap.short_term.map((ii) => (
//<Text>{ii.name}</Text>
//))}
//</Box>
//<Box flexDirection="column" flexGrow={1}>
//<Box marginBottom={1}>
//<Text bold>Not so recent</Text>
//</Box>
//{snap.medium_term.map((ii) => (
//<Text>{ii.name}</Text>
//))}
//</Box>
//<Box flexDirection="column" flexGrow={1}>
//<Box marginBottom={1}>
//<Text bold>Not so recent</Text>
//</Box>
//{snap.long_term.map((ii) => (
//<Text>{ii.name}</Text>
//))}
//</Box>
//</Box>
//);
//}
