/**
 * Fuzzy-match query against text, as in fzf: each word of query must match, with its characters appearing in
 * order (though not necessarily together), & matches of consecutive characters & of starts of words scoring higher.
 *
 * @param query query, eg. "lor stw"
 * @param text text to match, eg. "Lorem Ipsum Stew"
 * @returns indices of matched characters, & score (or undefined if text does not match)
 */
export const fuzzyMatch = (query: string, text: string): { indices: Set<number>; score: number } | undefined => {
    const lower = text.toLowerCase();

    // match word greedily from given position, scoring the match
    const matchFrom = (word: string, start: number): { indices: number[]; score: number } | undefined => {
        const indices: number[] = [];
        let [i, score] = [start, 0];
        for (const ch of word) {
            i = lower.indexOf(ch, i);
            if (i === -1) return undefined;
            const wordStart = i === 0 || /[^a-z0-9]/.test(lower[i - 1] ?? "");
            score += 1 + (indices.at(-1) === i - 1 ? 2 : 0) + (wordStart ? 3 : 0);
            indices.push(i++);
        }
        return { indices, score };
    };

    // best match of each word of query, over every position of its first character
    const indices = new Set<number>();
    let score = 0;
    for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
        let best: { indices: number[]; score: number } | undefined;
        for (let start = lower.indexOf(word[0] ?? ""); start !== -1; start = lower.indexOf(word[0] ?? "", start + 1)) {
            const match = matchFrom(word, start);
            if (match && match.score > (best?.score ?? -1)) best = match;
        }
        if (!best) return undefined;
        best.indices.forEach(i => indices.add(i));
        score += best.score;
    }
    return { indices, score };
};
