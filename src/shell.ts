import type { Line, RGB, Segment } from "types/global";

import { DIM, ERROR, FG, accent } from "palette";
import { SCREEN_MODES, setScreenMode } from "crt";

import DESTINATIONS from "destinations";

// terminal running commands
export interface Shell {
    show: (place?: number) => void; // show output, below given place (or over faded QR code), replacing any shown
    back: () => void;               // hide output, returning to menu
    print: (...segments: (Segment | string)[]) => void; // print line of output; strings take default colour
    // print line in two columns: the left one padded to given width, & the right one wrapping within its own
    columns: (width: number, left: (Segment | string)[], right: (Segment | string)[]) => void;
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
            sh.print("places (tap picture or type):");
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
 * @returns remainder of suggested command (empty if none)
 */
export const suggest = (line: string): string =>
    line === "" ? "" : COMPLETIONS.find(c => c.startsWith(line) && c !== line)?.slice(line.length) ?? "";

/**
 * Highlight syntax of command: words naming places take their accent colour; otherwise, the first word is in the
 * default colour if it is (or may become) a known command, or in the error colour if not, & later words are dim.
 *
 * @param line command
 * @returns segments of command
 */
export const highlight = (line: string): Line => {
    let first = true;
    return line.split(/(\s+)/).filter(text => text !== "").map(text => {
        if (/^\s/.test(text)) return { color: FG, text };
        const place = PLACES.find(({ words }) => words.includes(text));
        const known = COMPLETIONS.some(c => c.startsWith(text));
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

    const index = resolve(line);
    const place = index === undefined ? undefined : PLACES[index];
    if (index !== undefined && place) {
        sh.show(index);
        sh.print({ color: place.accent, text: place.words[0] ?? "" }, ": under construction, coming soon!");
        sh.print({ color: DIM, text: "(press esc, or tap elsewhere, to go back)" });
        return;
    }

    const command = COMMANDS.get(name);
    if (command) command.run(sh, args);
    else fail(sh, `dsh: command not found: ${name}`);
};
