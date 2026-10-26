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

// fields shared by novels, nonfiction, films & games
interface Tracked<Status> extends Note {
    status: Status;
    started?: string;    // as precise as known, eg. "2024-06-28", "2024-05", or "2023"
    finished?: string;
    rating?: number;     // 1–5, in quarter steps
    shortlist?: boolean;
    "recommended-by"?: string; // initials
    tags?: string[];
}

// novel (or play, or short stories), from content/novels/
export interface Novel extends Tracked<ReadingStatus> {
    author?: string;
    translator?: string;
    series?: string;
    "series-number"?: number; // place in series: 0 for a prequel, 2.5 between books 2 & 3
    year?: number;
    isbn?: string;
    pages?: number;
    cover?: string;
    owned?: boolean;
}

// film, series, or anime, from content/films/
export interface Film extends Tracked<WatchingStatus> {
    kind?: "film" | "series" | "anime";
    year?: number;
    director?: string;   // or creator, of series
    tmdb?: string;
    poster?: string;
}

// video game, from content/games/
export interface Game extends Tracked<PlayingStatus> {
    year?: number;
    developer?: string;
    platform?: string;   // what it was played on
    igdb?: string;       // slug on IGDB
    cover?: string;
    owned?: boolean;
}

// standalone page (eg. a packlist, or a ranked list), from content/pages/
export interface Page extends Note {
    destination?: string; // name of destination in whose menu page appears, eg. "moon-and-stars"
}
