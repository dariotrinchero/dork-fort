"""Fuzzy matching as in fzf: a port of the site's src/fuzzy.ts, so dork ranks as the site's shell does."""

import re


def fuzzy_match(query: str, text: str) -> tuple[set[int], int] | None:
    """Indices of text's characters matched by query, & score, or None if text doesn't match. Each word of query
    must match, its characters in order (though not necessarily together), & matches of consecutive characters &
    of starts of words score higher."""
    lower = text.lower()

    def match_from(word: str, start: int) -> tuple[list[int], int] | None:
        """Match word greedily from position, scoring the match."""
        indices: list[int] = []
        i, score = start, 0
        for ch in word:
            i = lower.find(ch, i)
            if i == -1: return None
            word_start = i == 0 or bool(re.match(r"[^a-z0-9]", lower[i - 1]))
            score += 1 + (2 if indices and indices[-1] == i - 1 else 0) + (3 if word_start else 0)
            indices.append(i)
            i += 1
        return indices, score

    # best match of each word of query, over every position of its first character
    matched: set[int] = set()
    score = 0
    for word in query.lower().split():
        best = None
        start = lower.find(word[0])
        while start != -1:
            match = match_from(word, start)
            if match and match[1] > (best[1] if best else -1): best = match
            start = lower.find(word[0], start + 1)
        if not best: return None
        matched.update(best[0])
        score += best[1]
    return matched, score
