import type { Line, RGB, Segment } from "types/global";
import type { WindowContent } from "window";

import { DIM, ERROR, FG, accent } from "palette";
import { SCREEN_MODES, setScreenMode } from "crt";
import { campfireIntro, campfireMenu, campfireWindow } from "campfire";

import DESTINATIONS from "destinations";

// entry of menu shown by place, opening a window
export interface MenuEntry {
    name: string;     // name, which opens entry when entered as a command while place is shown, & appears in URL
    label: Line;      // label in menu
    marker?: Segment; // printed before label (eg. a star), such that wrapped label hangs past it
}

// section of menu shown by place
export interface MenuSection {
    entries: MenuEntry[];
    heading?: Line;  // printed above entries
    aside?: boolean; // whether section goes beside icon of place, where there is room (see Shell.aside)
}

// what a place shows: a description, a menu (given its accent colour), & windows opened from it
interface PlaceContents {
    intro: (accent: RGB) => Line[];
    menu: (accent: RGB) => MenuSection[];
    window: (name: string) => WindowContent | undefined;
}

// terminal running commands
export interface Shell {
    show: (place?: number) => void; // show output, below given place (or over faded QR code), replacing any shown
    back: () => void;               // hide output, returning to menu
    print: (...segments: (Segment | string)[]) => void; // print line of output; strings take default colour
    // print line in two columns: the left one padded to given width, & the right one wrapping within its own
    columns: (width: number, left: (Segment | string)[], right: (Segment | string)[]) => void;
    // print line which runs command when clicked, wrapping (with given hanging indent) to at most two rows
    link: (command: string, indent: number, ...segments: (Segment | string)[]) => void;
    // print lines (by calling given function, which prints them) beside icon of place shown, if there is room
    // there, & otherwise in place, among other lines
    aside: (print: () => void) => void;
    go: (route: string[]) => void;    // navigate to route (see route.ts), eg. ["campfire", "cookbook"]
    shown: () => number | undefined;  // index of place shown (if any)
}

interface Command {
    run: (sh: Shell, args: string[]) => void;
}

// destination, as reached by commands
interface Place {
    accent: RGB;
    phrase: string;  // canonical command navigating to place, eg. "ls garden"
    words: string[]; // name of place (eg. "garden"), & its aliases, each of which also navigates to it
}

export const PLACES: Place[] = DESTINATIONS.map(({ aliases = [], color, name }) => {
    const target = /\{([^{}]+)\}/.exec(name)?.[1];
    if (target === undefined) throw new Error(`Destination name "${name}" has no part in braces`);
    return { accent: accent(color), phrase: name.replace(/[{}]/g, ""), words: [target, ...aliases] };
});

// contents of places (so far, only campfire), keyed by name of place
const CONTENTS = new Map<string, PlaceContents>([
    ["campfire", { intro: campfireIntro, menu: campfireMenu, window: campfireWindow }],
]);

/**
 * Get contents of place.
 *
 * @param place index of place (or undefined if none)
 * @returns contents of place (or undefined if it has none yet)
 */
const contentsOf = (place?: number): PlaceContents | undefined =>
    CONTENTS.get(place === undefined ? "" : PLACES[place]?.words[0] ?? "");

/**
 * Get menu of place.
 *
 * @param place index of place (or undefined if none)
 * @returns entries of menu (empty if none)
 */
export const menuOf = (place?: number): (MenuEntry & { key: string })[] =>
    (contentsOf(place)?.menu(PLACES[place ?? -1]?.accent ?? FG) ?? [])
        .flatMap(({ entries }) => entries)
        .map((entry, i) => ({ ...entry, key: (i + 1).toString() })); // hotkeys in reading order (digits, which never begin a command)

/**
 * Get contents of window opened from place.
 *
 * @param place index of place
 * @param name name of item to open, eg. "cookbook"
 * @returns contents of window (or undefined if there is no such item)
 */
export const windowOf = (place: number, name: string): WindowContent | undefined => contentsOf(place)?.window(name);

// commands listed by help, besides places
const HELP = [
    ["help", "list commands"],
    ["ls", "list places"],
    ["cd ~", "go back (also Esc)"],
    ["crt on|off", "toggle CRT effect"],
];

/**
 * Show error message as output.
 *
 * @param sh terminal
 * @param message error message
 */
const fail = (sh: Shell, message: string): void => {
    sh.show();
    sh.print({ color: ERROR, text: message });
};

const back: Command = { run: sh => { sh.back(); } };

const COMMANDS = new Map<string, Command>([
    ["cd", {
        run: (sh, [dir]) => { // cd to place is handled by resolve()
            if (dir === undefined || ["~", "..", "/"].includes(dir)) sh.back();
            else fail(sh, `cd: no such place: ${dir}`);
        },
    }],
    ["clear", back],
    ["crt", {
        run: (sh, [mode = ""]) => {
            if (setScreenMode(mode)) sh.back(); // return to menu, to show off new screen
            else fail(sh, `crt: ${mode ? `unknown mode '${mode}'` : "no mode given"} (try on or off)`);
        },
    }],
    ["exit", back],
    ["help", {
        run: sh => {
            const width = Math.max(...PLACES.map(({ phrase }) => phrase.length)) + 4; // indent & gap of 2 each
            sh.show();
            sh.print("places (tap QR code or type):");
            PLACES.forEach(({ phrase, words: [, ...aliases] }) => {
                sh.columns(width, ["  ", ...highlight(phrase)], [{ color: DIM, text: aliases.join(", ") }]);
            });
            sh.print("");
            sh.print("commands:");
            HELP.forEach(([usage = "", summary = ""]) => {
                sh.columns(width, ["  ", ...highlight(usage)], [{ color: DIM, text: summary }]);
            });
        },
    }],
    ["ls", {
        run: (sh, [dir]) => { // ls to place is handled by resolve()
            if (dir === undefined) {
                sh.show();
                sh.print(...PLACES.flatMap(({ accent, words: [name = ""] }) => [{ color: accent, text: `${name}/` }, "  "]));
                return;
            }
            const place = PLACES.find(({ words }) => words.includes(dir));
            fail(sh, place
                ? `ls: ${dir}: not a directory (try '${place.phrase}')`
                : `ls: cannot access '${dir}': no such file or directory`);
        },
    }],
    ["sudo", { run: sh => { fail(sh, "you are not in the sudoers file. This incident will be reported."); } }],
]);

// lines suggested as completions, in order of preference
const COMPLETIONS = [...new Set([
    ...PLACES.map(({ phrase }) => phrase),
    ...PLACES.flatMap(({ words }) => words),
    ...COMMANDS.keys(),
    ...[...SCREEN_MODES.keys()].map(mode => `crt ${mode}`), // incl. monochrome modes, though hidden from help
])];

/**
 * Find place navigated to by given command: its canonical command, its name or an alias alone, or cd to either.
 *
 * @param line command
 * @returns index of place (or undefined if none)
 */
export const resolve = (line: string): number | undefined => {
    const words = line.trim().split(/\s+/);
    const [first = "", second = ""] = words;
    const name = words.length === 2 && first === "cd" ? second : words.length === 1 ? first : undefined;
    const index = PLACES.findIndex(({ phrase, words: names }) =>
        phrase === words.join(" ") || (name !== undefined && names.includes(name)));
    return index === -1 ? undefined : index;
};

/**
 * Suggest completion of given (partial) command.
 *
 * @param line partial command
 * @param shown index of place shown (if any), whose menu entries are then commands
 * @returns remainder of suggested command (empty if none)
 */
export const suggest = (line: string, shown?: number): string => line === "" ? "" : [
    ...menuOf(shown).map(({ name }) => name), ...COMPLETIONS,
].find(c => c.startsWith(line) && c !== line)?.slice(line.length) ?? "";

/**
 * Highlight syntax of command: words naming places (or entries of the menu of the place shown) take their accent
 * colour; otherwise, the first word is in the default colour if it is (or may become) a known command, or in the
 * error colour if not, & later words are dim.
 *
 * @param line command
 * @param shown index of place shown (if any), whose menu entries are then commands
 * @returns segments of command
 */
export const highlight = (line: string, shown?: number): Line => {
    let first = true;
    const entries = menuOf(shown);
    return line.split(/(\s+)/).filter(text => text !== "").map(text => {
        if (/^\s/.test(text)) return { color: FG, text };
        const place = (entries.some(({ name }) => name === text) ? PLACES[shown ?? -1] : undefined)
            ?? PLACES.find(({ words }) => words.includes(text));
        const known = [...entries.map(({ name }) => name), ...COMPLETIONS].some(c => c.startsWith(text));
        const color = place ? place.accent : first ? known ? FG : ERROR : DIM;
        first = false;
        return { color, text };
    });
};

/**
 * Run command.
 *
 * @param sh terminal on which to run command
 * @param line command
 */
export const execute = (sh: Shell, line: string): void => {
    const [name = "", ...args] = line.trim().split(/\s+/);
    if (name === "") return;

    // entries of menu of place shown open windows (taking precedence over names of places)
    const shown = sh.shown();
    const entry = args.length === 0 ? menuOf(shown).find(({ name: entryName }) => entryName === name) : undefined;
    if (shown !== undefined && entry) {
        sh.go([PLACES[shown]?.words[0] ?? "", entry.name]);
        return;
    }

    const index = resolve(line);
    const place = index === undefined ? undefined : PLACES[index];
    if (index !== undefined && place) {
        sh.show(index);
        const contents = contentsOf(index);
        if (!contents) {
            sh.print({ color: place.accent, text: place.words[0] ?? "" }, ": under construction, coming soon!");
            sh.print({ color: DIM, text: "(press esc or tap elsewhere to go back)" });
            return;
        }

        // description & menu, whose entries open windows (by clicking, hotkey, or name)
        contents.intro(place.accent).forEach(segments => { sh.print(...segments); });
        let key = 0;
        contents.menu(place.accent).forEach(({ aside = false, entries, heading }) => {
            const printSection = (): void => {
                if (heading) sh.print(...heading);
                entries.forEach(({ label, marker, name: entryName }) => {
                    const prefix = [{ color: DIM, text: `[${(++key).toString()}] ` }, ...marker ? [marker] : []];
                    const indent = prefix.reduce((sum, { text }) => sum + text.length, 0);
                    sh.link(entryName, indent, ...prefix, ...label);
                });
            };
            if (aside) sh.aside(printSection);
            else printSection();
        });
        return;
    }

    const command = COMMANDS.get(name);
    if (command) command.run(sh, args);
    else fail(sh, `dsh: command not found: ${name}`);
};
