import {
  createOwner,
  getNextChildId,
  runWithOwner,
  createLoadBoundary,
  flatten,
  NotReadyError,
  ErrorContext,
  getContext
} from "./signals.js";
import { sharedConfig } from "./shared.js";
import type { JSX } from "../jsx.js";

export { sharedConfig } from "./shared.js";
export type { HydrationContext } from "./shared.js";

/** Always false on server — no client hydration occurs. */
export function isHydrating(): boolean {
  return false;
}

/** No-op on server — hydration is a client-only concept. */
export function onHydrationEnd(_callback: () => void): void {}

type SSRTemplateObject = { t: string[]; h: Function[]; p: Promise<any>[] };

/**
 * Handles errors during SSR rendering.
 * Returns the promise source for NotReadyError (for async handling),
 * or delegates to the ErrorContext handler.
 */
export function ssrHandleError(err: any) {
  if (err instanceof NotReadyError) {
    return (err as any).source as Promise<any>;
  }
  const handler = getContext(ErrorContext);
  if (handler) {
    handler(err);
    return;
  }
  throw err;
}

/**
 * Tracks all resources inside a component and renders a fallback until they are all resolved
 *
 * On the server, this is SSR-aware: it handles async mode (streaming) by registering
 * fragments and resolving asynchronously, and sync mode by serializing fallback markers.
 *
 * @description https://docs.solidjs.com/reference/components/suspense
 */
export function Loading(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  const ctx = sharedConfig.context;
  if (!ctx) {
    return createLoadBoundary(
      () => props.children,
      () => props.fallback
    ) as unknown as JSX.Element;
  }

  const o = createOwner();
  const id = o.id!;
  (o as any).id = id + "00"; // fake depth to match client's createLoadBoundary nesting

  let runPromise: Promise<any> | undefined;
  function runInitially(): SSRTemplateObject {
    // Dispose children from previous attempt — signals now resets _childCount on dispose
    // so IDs are stable across re-render attempts.
    o.dispose(false);
    return runWithOwner(o, () => {
      try {
        return ctx!.resolve(flatten(props.children));
      } catch (err) {
        runPromise = ssrHandleError(err);
      }
    }) as any;
  }

  let ret = runInitially();
  // never suspended
  if (!(runPromise || ret?.p?.length)) return ret as unknown as JSX.Element;

  const fallbackOwner = createOwner({ id });
  getNextChildId(fallbackOwner); // move counter forward

  if (ctx.async) {
    const done = ctx.registerFragment(id);
    (async () => {
      try {
        while (runPromise) {
          await runPromise;
          runPromise = undefined;
          ret = runInitially();
        }
        while (ret.p.length) {
          await Promise.all(ret.p);
          ret = ctx.ssr(ret.t, ...ret.h);
        }
        done!(ret.t[0]);
      } catch (err) {
        done!(undefined, err);
      }
    })();

    return runWithOwner(fallbackOwner, () =>
      ctx.ssr(
        [`<template id="pl-${id}"></template>`, `<!--pl-${id}-->`],
        ctx.escape(props.fallback)
      )
    ) as unknown as JSX.Element;
  }

  ctx.serialize(id, "$$f");
  return runWithOwner(fallbackOwner, () => props.fallback) as unknown as JSX.Element;
}
