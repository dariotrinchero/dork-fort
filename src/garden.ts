import type { Line } from "types/global";

import { DIM } from "palette";

/**
 * Get lines describing garden, shown above its menu.
 *
 * @returns lines of description
 */
export const gardenIntro = (): Line[] => [
    [{ color: DIM, text: "ls: all manner of loathsome vermin <3" }],
    [],
];
