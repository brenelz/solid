import {
  getOwner,
  createLoadBoundary,
  flush,
  runWithOwner,
  getNextChildId,
  createMemo as coreMemo,
  createSignal as coreSignal,
  type Owner
} from "@solidjs/signals";
import { JSX } from "../jsx.js";

// Re-export pass-throughs for store primitives (hydration wrappers to be added later)
export {
  createStore,
  createProjection,
  createOptimistic,
  createOptimisticStore
} from "@solidjs/signals";

export type HydrationContext = {};

type SharedConfig = {
  hydrating: boolean;
  resources?: { [key: string]: any };
  load?: (id: string) => Promise<any> | any;
  has?: (id: string) => boolean;
  gather?: (key: string) => void;
  registry?: Map<string, Element>;
  done: boolean;
  getNextContextId(): string;
};

export const sharedConfig: SharedConfig = {
  hydrating: false,
  registry: undefined,
  done: false,
  getNextContextId() {
    const o = getOwner();
    if (!o) throw new Error(`getNextContextId cannot be used under non-hydrating context`);
    return getNextChildId(o);
  }
};

// === Override slots for hydration-aware primitives (tree-shakeable) ===
// Only assigned inside enableHydration(). If enableHydration is never called
// (no hydrate() import), the hydrated* functions and their dependencies
// (MockPromise, subFetch) are eliminated by the bundler.

let _createMemo: Function | undefined;
let _createSignal: Function | undefined;

// --- Hydration helpers ---

class MockPromise {
  static all() {
    return new MockPromise();
  }
  static allSettled() {
    return new MockPromise();
  }
  static any() {
    return new MockPromise();
  }
  static race() {
    return new MockPromise();
  }
  static reject() {
    return new MockPromise();
  }
  static resolve() {
    return new MockPromise();
  }
  catch() {
    return new MockPromise();
  }
  then() {
    return new MockPromise();
  }
  finally() {
    return new MockPromise();
  }
}

function subFetch<T>(fn: (prev?: T) => any, prev?: T) {
  const ogFetch = fetch;
  const ogPromise = Promise;
  try {
    window.fetch = () => new MockPromise() as any;
    Promise = MockPromise as any;
    return fn(prev);
  } finally {
    window.fetch = ogFetch;
    Promise = ogPromise;
  }
}

// --- Hydration-aware implementations ---

function hydratedCreateMemo(compute: any, value?: any, options?: any) {
  if (!sharedConfig.hydrating) return coreMemo(compute, value, options);
  return coreMemo(
    (prev: any) => {
      const o = getOwner()!;
      if (!sharedConfig.hydrating) return compute(prev);
      let initP: any;
      if (sharedConfig.has!(o.id!)) initP = sharedConfig.load!(o.id!);
      const init = initP?.v ?? initP;
      return init != null ? (subFetch(compute, prev), init) : compute(prev);
    },
    value,
    options
  );
}

function hydratedCreateSignal(fn?: any, second?: any, third?: any) {
  if (typeof fn !== "function" || !sharedConfig.hydrating) return coreSignal(fn, second, third);
  return coreSignal(
    (prev: any) => {
      if (!sharedConfig.hydrating) return fn(prev);
      const o = getOwner()!;
      let initP: any;
      if (sharedConfig.has!(o.id!)) initP = sharedConfig.load!(o.id!);
      const init = initP?.v ?? initP;
      return init != null ? (subFetch(fn, prev), init) : fn(prev);
    },
    second,
    third
  );
}

// --- Public API ---

export function enableHydration() {
  _createMemo = hydratedCreateMemo;
  _createSignal = hydratedCreateSignal;
}

// Wrapped primitives — delegate to override or core
export const createMemo: typeof coreMemo = ((...args: any[]) =>
  (_createMemo || coreMemo)(...args)) as typeof coreMemo;

export const createSignal: typeof coreSignal = ((...args: any[]) =>
  (_createSignal || coreSignal)(...args)) as typeof coreSignal;

// === Loading component ===

/**
 * Tracks all resources inside a component and renders a fallback until they are all resolved
 * ```typescript
 * const AsyncComponent = lazy(() => import('./component'));
 *
 * <Loading fallback={<LoadingIndicator />}>
 *   <AsyncComponent />
 * </Loading>
 * ```
 * @description https://docs.solidjs.com/reference/components/suspense
 */
export function Loading(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  if (!sharedConfig.hydrating)
    return createLoadBoundary(
      () => props.children,
      () => props.fallback
    ) as unknown as JSX.Element;

  return coreMemo(() => {
    const o = getOwner()!;
    const id = o.id!;
    if (sharedConfig.hydrating && sharedConfig.has!(id)) {
      let ref = sharedConfig.load!(id);
      let p: Promise<any> | any;
      if (ref) {
        if (typeof ref !== "object" || ref.s !== 1) p = ref;
        else sharedConfig.gather!(id);
      }
      if (p) {
        const [s, set] = coreSignal(undefined, { equals: false });
        s();
        if (p !== "$$f") {
          p.then(
            () => {
              sharedConfig.gather!(id);
              sharedConfig.hydrating = true;
              set();
              flush();
              sharedConfig.hydrating = false;
            },
            (err: any) =>
              runWithOwner(o as Owner, () => {
                throw err;
              })
          );
        } else queueMicrotask(set);
        return props.fallback;
      }
    }
    return createLoadBoundary(
      () => props.children,
      () => props.fallback
    );
  }) as unknown as JSX.Element;
}
