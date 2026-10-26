// notes of content vault (see content/ & scripts/bakeContent.js), as bundled: frontmatter only, without empty fields
// or drafts

// any note
interface Note {
    slug: string;        // filename, eg. "the-cave-saramago"
    title: string;
    aliases?: string[];
}

export type ReadingStatus = "to-read" | "reading" | "paused" | "read" | "dnf";
export type WatchingStatus = "to-watch" | "watching" | "paused" | "watched" | "dnf";
// "endless": played, but with nothing to finish (eg. Minecraft)
export type PlayingStatus = "to-play" | "playing" | "paused" | "endless" | "played" | "dnf";
// "played": played at all, as board games are made to be played again
export type BoardGameStatus = "to-play" | "played";

// fields shared by novels, nonfiction, films, games & board games
interface Tracked<Status> extends Note {
    status: Status;
    rating?: number;     // 1–5, in quarter steps
    shortlist?: boolean;
    "recommended-by"?: string; // initials
    tags?: string[];
}

// fields of what's started & finished (all but board games, which are played again & again)
interface Finished<Status> extends Tracked<Status> {
    started?: string;    // as precise as known, eg. "2024-06-28", "2024-05", or "2023"
    finished?: string;
}

// novel (or play, or short stories), from content/novels/
export interface Novel extends Finished<ReadingStatus> {
    author?: string;
    translator?: string;
    series?: string;
    "series-number"?: number; // place in series: 0 for a prequel, 2.5 between books 2 & 3
    year?: number;
    isbn?: string;
    pages?: number;
    cover?: string;
    owned?: boolean | "wishlist"; // wishlist: not owned, but wanted
}

// film, series, or anime, from content/films/
export interface Film extends Finished<WatchingStatus> {
    kind?: "film" | "series" | "anime";
    year?: number;
    director?: string;   // or creator, of series
    tmdb?: string;
    poster?: string;
}

// video game, from content/games/
export interface Game extends Finished<PlayingStatus> {
    year?: number;
    developer?: string;
    platform?: string;   // what it was played on
    igdb?: string;       // slug on IGDB
    cover?: string;
    owned?: boolean | "wishlist"; // wishlist: not owned, but wanted
}

// board game (or card game, or other tabletop game), from content/boardgames/
export interface BoardGame extends Tracked<BoardGameStatus> {
    year?: number;
    designer?: string;
    players?: string;    // how many can play, eg. "2–4"
    bgg?: string | number; // id on BoardGameGeek
    cover?: string;
    owned?: boolean | "wishlist"; // wishlist: not owned, but wanted
    "first-played"?: string; // as precise as known (as started is)
}

// standalone page (eg. a packlist, or a ranked list), from content/pages/
export interface Page extends Note {
    destination?: string; // name of destination in whose menu page appears, eg. "moon-and-stars"
}
