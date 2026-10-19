import {fetchUrl} from './spclient.js';

// Pathfinder (api-partner) — the GraphQL-ish endpoint (search + library).
// Queries are "persisted": Spotify serves them by sha256 hash and rotates
// the hashes every few months, so every operation carries a list of known
// hashes and we rotate on HTTP 412 (a retired hash). When ALL hashes 412,
// refresh the table from spotatui's search.rs (search, port doc §4) or the
// web player bundle (libraryV3, port doc §10).

const PATHFINDER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query';

const HEADERS = {
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json',
    'app-platform': 'Win32_x86_64',
    'spotify-app-version': '1.2.52.442'
};

// Hashes are ordered newest-first (port doc §4).
const HASHES = {
    searchDesktop: [
        'eef7cc54888d91bdd6802623477873caa3948ae173a0c34fd86827b267e94c03',
        'fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c',
        '3c9d3f60dac5dea3876b6db3f534192b1c1d90032c4233c1bbaba526db41eb31',
        '4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49'
    ],
    searchTracks: [
        'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751'
    ],
    searchArtists: [
        '7bf95d754fdbe32c8b161fbbe54d1ae50974900df4dce4c8f1afcbcad153224d'
    ],
    searchAlbums: [
        '202cb3305e31e5a0767ba7925f28bd728cf8f8b0217e6da43909056071cd70e9'
    ],
    searchPlaylists: [
        'd520014e748f9ea44f7707d8df1819867ac1205e8b7f3e28f22fe5fc858921b1'
    ],
    libraryV3: [
        // web player "Your Library" query (extracted from the web player
        // bundle — open.spotifycdn.com web-player.<hash>.js, port doc §10)
        '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455'
    ],
    searchPodcasts: [
        '0195d9f61b43606d490bca64c3456e3593528cea6cc05c7e822c7c42beed0f4e'
    ]
} as const;

export type Operation = keyof typeof HASHES;

// In-memory working index per operation (rotates on 412 within the process).
const hashIndex: Record<Operation, number> = {
    searchDesktop: 0,
    searchTracks: 0,
    searchArtists: 0,
    searchAlbums: 0,
    searchPlaylists: 0,
    libraryV3: 0,
    searchPodcasts: 0
};

export type PathfinderResponse = {
    data?: {
        searchV2?: {
            [field: string]: {items?: unknown[]} | undefined;
        };
        me?: {
            libraryV3?: unknown;
        };
    };
    errors?: {message?: string}[];
};

export async function pathfinderQuery(
    operation: Operation,
    variables: Record<string, unknown>
): Promise<PathfinderResponse> {
    const hashes = HASHES[operation];
    let index = hashIndex[operation];

    // +1 attempts: one per hash, plus we throw before looping past the end.
    for (let attempt = 0; attempt <= hashes.length; attempt++) {
        const response = await fetchUrl(PATHFINDER_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                variables,
                operationName: operation,
                extensions: {persistedQuery: {version: 1, sha256Hash: hashes[index]}}
            })
        });
        if (response.ok) {
            return (await response.json()) as PathfinderResponse;
        }
        if (response.status === 412) {
            // Retired hash — rotate to the next known hash and retry.
            index = (index + 1) % hashes.length;
            hashIndex[operation] = index;
            continue;
        }
        throw new Error(
            `pathfinder ${operation} failed: HTTP ${response.status} — ${(await response.text()).slice(0, 200)}`
        );
    }
    throw new Error(
        `pathfinder ${operation}: all ${hashes.length} hashes rejected (412) — refresh the hash table from spotatui search.rs (port doc §4)`
    );
}

// ── search ──────────────────────────────────────────────────────────────
// Answer shape (validated live for searchTracks, port doc §4): items are
// double-wrapped — data.searchV2.<type>V2.items[].item.data — and search is
// free-text only (no Web API field:"x" filters).

const searchVariables = (searchTerm: string, limit = 20) => ({
    searchTerm,
    offset: 0,
    limit,
    numberOfTopResults: 5,
    includeAudiobooks: false,
    includeArtistHasConcertsField: false,
    includePreReleases: false,
    includeLocalConcertsField: false,
    includeAuthors: false
});

export type SearchResult = {name: string; uri: string; artist?: string};

function unwrapItems(body: PathfinderResponse, field: string): Record<string, unknown>[] {
    const items = (body.data?.searchV2?.[field] as {items?: unknown[]} | undefined)?.items ?? [];
    // Items are wrapped per type (validated live): tracksV2 nests one extra
    // `.item` level, artists/albumsV2 are flat {__typename, data}.
    return items
        .map((item) => {
            const wrapper = item as {data?: Record<string, unknown>; item?: {data?: Record<string, unknown>}};
            return wrapper.data ?? wrapper.item?.data ?? null;
        })
        .filter((data): data is Record<string, unknown> => !!data);
}

export async function searchArtists(term: string, limit = 20): Promise<SearchResult[]> {
    // Validated live: the field is `artists` (not artistsV2), items are flat
    // {__typename, data}, and the name lives at data.profile.name.
    const body = await pathfinderQuery('searchArtists', searchVariables(term, limit));
    return unwrapItems(body, 'artists').map((data) => ({
        name: String((data.profile as {name?: unknown})?.name ?? data.uri),
        uri: String(data.uri)
    }));
}

export async function searchAlbums(term: string, limit = 20): Promise<SearchResult[]> {
    // Validated live: field is `albumsV2`, items flat {__typename, data} with
    // data.name and data.artists.items[].profile.name.
    const body = await pathfinderQuery('searchAlbums', searchVariables(term, limit));
    return unwrapItems(body, 'albumsV2').map((data) => ({
        name: String(data.name ?? ''),
        uri: String(data.uri),
        artist: ((data.artists as {items?: {profile?: {name?: string}}[] | undefined})?.items ?? [])
            .map((artist) => artist.profile?.name ?? '')
            .filter(Boolean)
            .join(', ')
    }));
}

// ── library: the user's saved playlists / followed artists / saved albums ──
// libraryV3 (validated live 2026-10-19, port doc §10): the web player's
// "Your Library" query. The collection/v2/paging sets only cover 'artist' —
// playlist/album sets 403 with our scopes; this pathfinder query serves all
// three tabs with names inline (no extra metadata requests needed).
// `filters` must be one of the CAPITALIZED ids from the answer's
// `availableFilters` ("Playlists" | "Artists" | "Albums") — lowercase values
// answer LibraryInvalidFilterIdError; `order: null` = Recents (default).
export type LibraryFilter = 'Playlists' | 'Artists' | 'Albums';

export type LibraryItem = {
    name: string;
    uri: string;
    artist?: string; // albums only (main artist names)
    addedAt: string; // ISO
};

type LibraryPage = {
    __typename?: string;
    totalCount?: number;
    pagingInfo?: {limit?: number; offset?: number};
    items?: {
        addedAt?: {isoString?: string};
        item?: {_uri?: string; data?: Record<string, unknown>};
    }[];
};

export async function fetchLibrary(filter: LibraryFilter): Promise<LibraryItem[]> {
    const limit = 50;
    const items: LibraryItem[] = [];
    for (let offset = 0; ; offset += limit) {
        const body = await pathfinderQuery('libraryV3', {
            filters: [filter],
            order: null,
            textFilter: null,
            features: [],
            limit,
            offset,
            flatten: false,
            expandedFolders: [],
            folderUri: null,
            includeFoldersWhenFlattening: true
        });
        const page = body.data?.me?.libraryV3 as LibraryPage | undefined;
        if (!page || page.__typename !== 'LibraryPage') {
            throw new Error(
                `libraryV3 ${filter} failed: ${page?.__typename ?? 'no libraryV3 in answer'}`
            );
        }
        const mapped = (page.items ?? [])
            .map((entry): LibraryItem | null => {
                const item = entry.item ?? {};
                const data = item.data ?? {};
                // Per type (validated live): Playlist {name, ownerV2},
                // Artist {profile: {name}}, Album {name, artists: {items: [{profile: {name}}]}}.
                const profile = data.profile as {name?: string} | undefined;
                const artists =
                    (data.artists as {items?: {profile?: {name?: string}}[]} | undefined)
                        ?.items ?? [];
                const name = String(profile?.name ?? data.name ?? '');
                const uri = String(item._uri ?? '');
                if (!name || !uri) return null;
                return {
                    name,
                    uri,
                    artist: artists.length
                        ? artists
                              .map((artist) => artist.profile?.name ?? '')
                              .filter(Boolean)
                              .join(', ')
                        : undefined,
                    addedAt: String(entry.addedAt?.isoString ?? '')
                };
            })
            .filter((item): item is LibraryItem => !!item);
        items.push(...mapped);
        if (mapped.length < limit || items.length >= (page.totalCount ?? 0)) break;
    }
    return items;
}
