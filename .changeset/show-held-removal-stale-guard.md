---
"solid-js": patch
---

A non-keyed `<Show>` or `<Match>` branch whose removal an action holds no longer throws the stale-read error when a child re-runs (#4137). The engine keeps that branch on screen as a zombie until the landing's commit disposes it, and re-runs its computations for live writes meanwhile; the narrowed accessor's guard judged the branch by the held selection (`<Show>`'s selecting read, `<Match>`'s untracked `switchFunc`), so a child memo reading the accessor during such a re-run threw "Attempting to access a stale value" and halted reactivity (`REACTIVITY_HALTED`). The guard now follows the branch's own lifetime: an `onCleanup` under the selecting memo marks the accessor stale when the branch's frame is disposed, which is the commit that replaces it, or its owner's death. A genuine stale read, after the branch is gone, still throws.
