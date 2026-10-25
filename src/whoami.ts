import type { Line, RGB } from "types/global";

import { FG, accent as accentOf } from "palette";

import DESTINATIONS from "destinations";

const [USER, HOST] = ["dario", "dork-fort"];
const BIRTH = { day: 6, month: 4, year: 1998 }; // date of birth (month counted from 0, as by Date), for uptime
const DAY = 24 * 60 * 60 * 1000; // in milliseconds

/**
 * Get uptime (ie. age) as of given date: whole years since birth, & days since last birthday.
 *
 * @param today date
 * @returns years & days
 */
const uptime = (today: Date): [number, number] => {
    const { day, month, year } = BIRTH;
    const years = today.getFullYear() - year - (new Date(today.getFullYear(), month, day) > today ? 1 : 0);
    const birthday = new Date(year + years, month, day);
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return [years, Math.round((midnight.getTime() - birthday.getTime()) / DAY)]; // rounded, as days span DST changes
};

/**
 * Count things, eg. "1 day" or "28 years".
 *
 * @param count number of things
 * @param unit name of one thing
 * @returns count, with unit
 */
const plural = (count: number, unit: string): string => `${count.toString()} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Get lines shown beside nametag, in the style of neofetch (with the nametag as its logo): user & host, facts
 * about me as fields of the system, & a swatch of the accent colours of every destination.
 *
 * @param accent accent colour of whoami
 * @returns lines beside nametag
 */
export const whoamiAside = (accent: RGB): Line[] => {
    const [years, days] = uptime(new Date());
    const fields = [
        ["OS", "DorkFort 1.0"],
        ["Host", "Cape Town, SA"],
        ["Uptime", `${plural(years, "year")}, ${plural(days, "day")}`],
        ["Shell", "no, I'm a mammal"],
        ["Resolution", "have more adventures"],
        ["Hobbies", "climbing, cooking, TTRPG, frogs…"],
		["Memory", "already forgotten your name"]
    ];
    return [
        [{ color: accent, text: USER }, { color: FG, text: "@" }, { color: accent, text: HOST }],
        [{ color: FG, text: "-".repeat(`${USER}@${HOST}`.length) }],
        ...fields.map(([label = "", value = ""]) => [{ color: accent, text: `${label}: ` }, { color: FG, text: value }]),
        [],
        DESTINATIONS.map(({ color }) => ({ color: accentOf(color), text: "██" })),
    ];
};
