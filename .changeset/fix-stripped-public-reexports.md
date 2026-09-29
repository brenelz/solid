---
"solid-js": patch
---

`createErrorBoundary`, `createLoadingBoundary`, `createRevealOrder`, `sharedConfig` (with its `isHydrationInProgress` and `onHydrationEnd`) and `$DEVCOMP` are declared again in the published types, and `ROOT_ERROR_HOOK` on the server entry (#3709). Their declarations carried a documentation `@internal` tag from before the declaration build switched `stripInternal` on, so `types/index.d.ts` re-exported names that `types/client/hydration.d.ts` and `types/client/core.d.ts` no longer declared: TS2305 for a consumer with `skipLibCheck: false`, and `any` for everyone else, so a `fallback={(error, reset) => ...}` handed to `createErrorBoundary` lost its parameter types. The runtime exports were never affected. The `solid-js` suite now type-checks every entry's emitted declarations with `skipLibCheck: false`, so a re-export that `stripInternal` dropped fails the test.
