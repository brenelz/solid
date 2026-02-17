import {
  getOwner,
  createLoadBoundary,
  createErrorBoundary as coreErrorBoundary,
  flush,
  runWithOwner,
  getNextChildId,
  peekNextChildId,
  createMemo as coreMemo,
  createSignal as coreSignal,
  createOptimistic as coreOptimistic,
  createProjection as coreProjection,
  createStore as coreStore,
  createOptimisticStore as coreOptimisticStore,
  type Owner
} from "@solidjs/signals";
import { JSX } from "../jsx.js";

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
let _createErrorBoundary: Function | undefined;
let _createOptimistic: Function | undefined;
let _createProjection: Function | undefined;
let _createStore: Function | undefined;
let _createOptimisticStore: Function | undefined;

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

function hydratedCreateErrorBoundary<U>(
  fn: () => any,
  fallback: (error: unknown, reset: () => void) => U
): () => unknown {
  if (!sharedConfig.hydrating) return coreErrorBoundary(fn, fallback);
  // The server's createErrorBoundary creates an owner via createOwner() and
  // serializes caught errors at that owner's ID. Peek at what ID the boundary
  // owner will get (without consuming the counter slot), then check sharedConfig.
  const parent = getOwner()!;
  const expectedId = peekNextChildId(parent);
  if (sharedConfig.has!(expectedId)) {
    const err = sharedConfig.load!(expectedId);
    if (err !== undefined) {
      // Server had an error — use throw-once pattern so reset() can recover.
      // First call throws the serialized error (matching server state).
      // On reset, recompute runs the wrapper again with hydrated=false,
      // so the real fn() executes and children render fresh.
      let hydrated = true;
      return coreErrorBoundary(() => {
        if (hydrated) {
          hydrated = false;
          throw err;
        }
        return fn();
      }, fallback);
    }
  }
  return coreErrorBoundary(fn, fallback);
}

function hydratedCreateOptimistic(fn?: any, second?: any, third?: any) {
  if (typeof fn !== "function" || !sharedConfig.hydrating) return coreOptimistic(fn, second, third);
  return coreOptimistic(
    (prev: any) => {
      const o = getOwner()!;
      if (!sharedConfig.hydrating) return fn(prev);
      let initP: any;
      if (sharedConfig.has!(o.id!)) initP = sharedConfig.load!(o.id!);
      const init = initP?.v ?? initP;
      return init != null ? (subFetch(fn, prev), init) : fn(prev);
    },
    second,
    third
  );
}

function wrapStoreFn(fn: any) {
  return (draft: any) => {
    const o = getOwner()!;
    if (!sharedConfig.hydrating) return fn(draft);
    let initP: any;
    if (sharedConfig.has!(o.id!)) initP = sharedConfig.load!(o.id!);
    const init = initP?.v ?? initP;
    return init != null ? (subFetch(fn, draft), init) : fn(draft);
  };
}

function hydratedCreateStore(first?: any, second?: any, third?: any) {
  if (typeof first !== "function" || !sharedConfig.hydrating)
    return coreStore(first, second, third);
  return coreStore(wrapStoreFn(first), second, third);
}

function hydratedCreateOptimisticStore(first?: any, second?: any, third?: any) {
  if (typeof first !== "function" || !sharedConfig.hydrating)
    return coreOptimisticStore(first, second, third);
  return coreOptimisticStore(wrapStoreFn(first), second, third);
}

function hydratedCreateProjection(fn: any, initialValue?: any, options?: any) {
  if (!sharedConfig.hydrating) return coreProjection(fn, initialValue, options);
  return coreProjection(wrapStoreFn(fn), initialValue, options);
}

// --- Public API ---

export function enableHydration() {
  _createMemo = hydratedCreateMemo;
  _createSignal = hydratedCreateSignal;
  _createErrorBoundary = hydratedCreateErrorBoundary;
  _createOptimistic = hydratedCreateOptimistic;
  _createProjection = hydratedCreateProjection;
  _createStore = hydratedCreateStore;
  _createOptimisticStore = hydratedCreateOptimisticStore;
}

// Wrapped primitives — delegate to override or core
export const createMemo: typeof coreMemo = ((...args: any[]) =>
  (_createMemo || coreMemo)(...args)) as typeof coreMemo;

export const createSignal: typeof coreSignal = ((...args: any[]) =>
  (_createSignal || coreSignal)(...args)) as typeof coreSignal;

export const createErrorBoundary: typeof coreErrorBoundary = ((...args: any[]) =>
  (_createErrorBoundary || coreErrorBoundary)(...args)) as typeof coreErrorBoundary;

export const createOptimistic: typeof coreOptimistic = ((...args: any[]) =>
  (_createOptimistic || coreOptimistic)(...args)) as typeof coreOptimistic;

export const createProjection: typeof coreProjection = ((...args: any[]) =>
  (_createProjection || coreProjection)(...args)) as typeof coreProjection;

export const createStore: typeof coreStore = ((...args: any[]) =>
  (_createStore || coreStore)(...args)) as typeof coreStore;

export const createOptimisticStore: typeof coreOptimisticStore = ((...args: any[]) =>
  (_createOptimisticStore || coreOptimisticStore)(...args)) as typeof coreOptimisticStore;

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
