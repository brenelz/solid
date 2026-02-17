---
name: Goal 1 Fine-Grained Async
overview: Audit and harden the fine-grained server async prototype — verify the {t,h,p} template system works end-to-end, write comprehensive tests, and identify gaps between the current Loading component's re-render loop and the targeted hole re-resolution approach.
todos:
  - id: g1-audit-trace
    content: Trace the full async SSR path through Loading, createMemo, resolveSSRNode, and registerFragment
    status: completed
  - id: g1-audit-rerender-vs-finegrained
    content: "Determine: is the current Loading truly re-rendering from boundary, or is {t,h,p} already doing partial resolution?"
    status: completed
  - id: g1-test-infra
    content: Set up SSR async test infrastructure in packages/solid/test/server/
    status: completed
  - id: g1-test-basic
    content: "Write tests: single async, parallel async, nested boundaries"
    status: completed
  - id: g1-test-advanced
    content: "Write tests: chained async, conditional async, async in For, error+async, re-entrant holes"
    status: completed
  - id: g1-gap-analysis
    content: "Catalog gaps: unnecessary re-renders, correctness issues, ID stability during async"
    status: completed
  - id: g1-fix
    content: Implement fixes based on gap analysis
    status: completed
isProject: false
---

# Goal 1: Fine-Grained Server Async

> **Parent plan**: [SSR Hydration Master Plan](/Users/ryancarniato/.cursor/plans/ssr-hydration-master.plan.md) — Goal 1
> **Repos**: solid (next branch), dom-expressions (next branch)

## Context

Solid 1.0 re-renders everything below a Suspense boundary when async is encountered. The 2.0 prototype uses a structured template format `{ t: [], h: [], p: [] }` that captures async "holes" — functions that threw `NotReadyError` — alongside their promises. The `Loading` server component re-runs these holes when promises resolve.

**Current prototype state** (what exists today):

- dom-expressions `next`: `resolveSSRNode` returns `{ t, h, p }` objects, catches `NotReadyError` in function children
- solid server: `Loading` in [packages/solid/src/server/hydration.ts](packages/solid/src/server/hydration.ts) has a `runInitially()` loop that disposes + re-runs children when promises resolve
- solid server: `createMemo` in [packages/solid/src/server/signals.ts](packages/solid/src/server/signals.ts) chains re-computation on `NotReadyError` via `source?.then(() => update())`
- dom-expressions `next`: `ssr()` function resolves template + holes into final HTML, re-executing all holes on each pass

## Step 1: Audit the prototype — COMPLETED

Traced the full async SSR path through all three layers. Key findings:

### Two distinct async paths exist in `Loading`

**Path 1 — Hole capture (fine-grained, the normal path):**
In compiled JSX, expressions are wrapped as function holes in `ssr()` templates (e.g., `ssr(["<div>", "</div>"], () => data())`). When `resolveSSRNode` calls a hole function and it throws `NotReadyError`, the function is captured in `result.h`, the promise in `result.p`. The surrounding template strings are preserved. `Loading` then enters `while (ret.p.length) { await Promise.all(ret.p); ret = ctx.ssr(ret.t, ...ret.h); }` — only the hole functions are re-executed, not the entire boundary subtree. **This is already fine-grained.**

**Path 2 — Boundary re-render (full re-render, edge case):**
When `NotReadyError` escapes `resolveSSRNode` (e.g., a memo is read directly in the component body: `const val = data()`), it propagates to `runInitially()`'s catch block, setting `runPromise`. This triggers `while (runPromise) { await runPromise; ret = runInitially(); }` which calls `o.dispose(false)` and re-renders everything from scratch. **This only fires for edge cases.**

### Conclusion: Path (a) — the prototype is already correct

The `{ t, h, p }` system already provides fine-grained resolution for typical compiled JSX. No architectural rework needed. Just edge case fixes.

## Step 2: Write SSR async tests — COMPLETED

**Test file**: [packages/solid/test/server/ssr-async.spec.ts](packages/solid/test/server/ssr-async.spec.ts) — 25 tests, all passing.

Infrastructure: mock SSR context replicating `resolveSSRNode`, `ssr`, `escape` from dom-expressions, with fragment tracking via `registeredFragments` (Set), `fragmentResults` (Map), and `fragmentErrors` (Map).


| Category                      | Tests | Result                                                                        |
| ----------------------------- | ----- | ----------------------------------------------------------------------------- |
| Basic Async (hole path)       | 3     | Single memo resolves; sync bypasses async; fallback has correct `pl-` markers |
| Parallel Async                | 2     | Multiple memos resolve in one pass; `Promise.all` waits for all               |
| Nested Boundaries             | 1     | Inner handles async, outer passes through                                     |
| Chained Async                 | 1     | Derived memo resolves in single pass                                          |
| Conditional Async             | 2     | Show when=true propagates; when=false produces no async                       |
| Async in For                  | 1     | Per-iteration async captured as holes                                         |
| Re-entrant Holes              | 3     | Single re-entry, triple sequential re-entry, re-entry with error              |
| Throw Path                    | 1     | Direct body read triggers `runInitially` re-render, renderCount=2             |
| Error Handling                | 2     | Rejected promise serialized via done; pending promise stays unresolved        |
| Errored + Loading Interaction | 6     | Sync/async errors with/without Errored; createErrorBoundary serialization     |
| ID Stability                  | 2     | Hole path: owners persist; Throw path: IDs match across re-renders            |
| Sync fallback mode            | 1     | Non-async context serializes `"$$f"`                                          |


## Step 3: Gap analysis — COMPLETED

### Gap 1: Missing error handling in Loading's async IIFE

`Loading`'s async IIFE has no `try/catch` around `await Promise.all(ret.p)`. If any async memo's promise rejects, the IIFE throws an unhandled rejection and `done()` is never called, causing the stream to hang indefinitely.

**Fix**: Wrap the IIFE in `try/catch` and call `done(undefined, error)` on rejection.

### Gap 2: All holes re-executed on each pass

`ctx.ssr(ret.t, ...ret.h)` re-executes ALL hole functions each iteration, not just the ones whose promises resolved. With N independent async holes resolving at different times, this could cause redundant evaluations. In practice, `Promise.all` mitigates this by waiting for all pending promises, so typically only one pass is needed.

**Assessment**: Minor inefficiency, not a correctness issue. Low priority.

### No other gaps found

- ID stability is correct in both paths (`dispose` resets `_childCount` for deterministic ID regeneration)
- Chained memos resolve correctly (`.then(() => update())` chains fire before `Promise.all` continues)
- Nested boundaries work correctly (inner handles its own async, outer sees sync)

## Step 4: Fix — COMPLETED

All fixes applied:

- **Gap 1 fixed**: Added try/catch to Loading's async IIFE in `packages/solid/src/server/hydration.ts`. On error, calls `done!(undefined, err)` to serialize the error to the client stream.
- **Unhandled rejection fixed**: Added rejection handlers to `.then()` calls in `processResult` (`packages/solid/src/server/signals.ts`) to prevent unhandled promise rejection warnings when async memos reject.
- `**createErrorBoundary` serialization fixed**: Added `ctx.serialize(owner.id, err)` to both error paths (ErrorContext handler and try/catch) in `createErrorBoundary` (`packages/solid/src/server/signals.ts`). This serializes caught errors for client hydration, matching 1.0's `ErrorBoundary` behavior.

### Errored + Loading interaction tests (6 new)


| Test                                     | Scenario                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Errored inside Loading — sync error      | Errored catches, renders fallback; Loading sees sync; error serialized via `ctx.serialize` |
| Errored inside Loading — async rejection | IIFE catch fires → `done(undefined, err)` → error serialized to stream                     |
| No Errored — sync error propagates up    | Error escapes Loading entirely (pre-flush); `expect().toThrow()`                           |
| Throw path — error during re-render      | Component throw path, re-render throws regular error → serialized via done                 |
| Mixed: resolve + reject                  | Two memos, one resolves, one rejects → `Promise.all` rejects → error serialized            |
| createErrorBoundary serializes error     | Standalone: error caught by boundary → `serialized` map contains error keyed by owner ID   |


### Remaining work (lower priority)

- ~~**Test re-entrant holes**~~: **Done** — 3 tests added. The `while (ret.p.length)` loop handles re-entrant holes correctly: single re-entry, triple sequential re-entry, and re-entry with error on second pass all pass.
- **Integration test**: End-to-end test through `renderToStream` (in dom-expressions or solid-web) to verify the full pipeline including fragment replacement and script injection.

