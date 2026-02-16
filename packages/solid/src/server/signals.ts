// Mock @solidjs/signals for server-side rendering
// Re-exports infrastructure from the real package, reimplements reactive primitives as pull-based.

// === Re-exports from @solidjs/signals (infrastructure — no reactive scheduling) ===

export {
  createRoot,
  createOwner,
  runWithOwner,
  getOwner,
  onCleanup,
  getNextChildId,
  createContext,
  setContext,
  getContext,
  NotReadyError,
  NoOwnerError,
  ContextNotFoundError,
  isEqual,
  isWrappable,
  SUPPORTS_PROXY
} from "@solidjs/signals";

export { flatten } from "@solidjs/signals";
export { snapshot, merge, omit, $PROXY, $TRACK } from "@solidjs/signals";

// === Type re-exports ===

export type {
  Accessor,
  ComputeFunction,
  EffectFunction,
  EffectBundle,
  EffectOptions,
  MemoOptions,
  NoInfer,
  SignalOptions,
  Setter,
  Signal,
  Owner,
  Maybe,
  Store,
  StoreSetter,
  StoreNode,
  NotWrappable,
  SolidStore,
  Merge,
  Omit,
  Context,
  ContextRecord,
  IQueue
} from "@solidjs/signals";

// === Local imports ===

import {
  createOwner,
  getOwner,
  getNextChildId,
  setContext,
  getContext,
  isWrappable,
  NotReadyError,
  runWithOwner
} from "@solidjs/signals";

import type {
  Accessor,
  ComputeFunction,
  EffectFunction,
  EffectBundle,
  EffectOptions,
  MemoOptions,
  SignalOptions,
  Setter,
  Signal,
  Owner,
  Store,
  StoreSetter,
  Context
} from "@solidjs/signals";

import { sharedConfig } from "./shared.js";

// === Observer tracking (for async memo) ===

interface ServerComputation<T = any> {
  owner: Owner;
  value: T;
  compute: ComputeFunction<any, T>;
  error: unknown;
  computed: boolean;
}

let Observer: ServerComputation | null = null;

function runWithObserver<T>(comp: ServerComputation, fn: () => T): T {
  const prev = Observer;
  Observer = comp;
  try {
    return fn();
  } finally {
    Observer = prev;
  }
}

export function getObserver() {
  return Observer;
}

// === Reactive Primitives (pull-based) ===

export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: Exclude<T, Function>, options?: SignalOptions<T>): Signal<T>;
export function createSignal<T>(
  fn: ComputeFunction<T>,
  initialValue?: T,
  options?: SignalOptions<T>
): Signal<T>;
export function createSignal<T>(
  first?: T | ComputeFunction<T>,
  second?: T | SignalOptions<T>,
  third?: SignalOptions<T>
): Signal<T | undefined> {
  // Function form delegates to createMemo-based writable signal
  if (typeof first === "function") {
    const memo = createMemo<Signal<T>>(p => {
      let value = (first as (prev?: T) => T)(p ? p[0]() : (second as T));
      return [
        () => value,
        v => {
          return ((value as any) = typeof v === "function" ? (v as (prev: T) => T)(value) : v);
        }
      ] as Signal<T>;
    });
    return [() => memo()[0](), (v => memo()[1](v as any)) as Setter<T | undefined>];
  }
  // Plain value form — no ID allocation (IDs are only for owners/computations)
  return [
    () => first as T,
    v => {
      return ((first as any) = typeof v === "function" ? (v as (prev: T) => T)(first as T) : v);
    }
  ] as Signal<T | undefined>;
}

export function createMemo<Next extends Prev, Prev = Next>(
  compute: ComputeFunction<undefined | NoInfer<Prev>, Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init = Next, Prev = Next>(
  compute: ComputeFunction<Init | Prev, Next>,
  value: Init,
  options?: MemoOptions<Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init, Prev>(
  compute: ComputeFunction<Init | Prev, Next>,
  value?: Init,
  options?: MemoOptions<Next>
): Accessor<Next> {
  // Capture SSR context at creation time — async re-computations (via .then callbacks)
  // may run after a concurrent request has overwritten sharedConfig.context.
  const ctx = sharedConfig.context;
  const owner = createOwner();
  const comp: ServerComputation<Next> = {
    owner,
    value: value as any,
    compute: compute as ComputeFunction<any, Next>,
    error: undefined,
    computed: false
  };

  function update() {
    try {
      comp.error = undefined;
      const result = runWithOwner(owner, () =>
        runWithObserver(comp, () => comp.compute(comp.value))
      );
      comp.computed = true;
      processResult(comp, result, owner, ctx);
    } catch (err) {
      if (err instanceof NotReadyError) {
        // Chain re-computation when dependency resolves (mirrors archived createAsync's processSource pattern)
        (err as any).source?.then(() => update());
      }
      comp.error = err;
      comp.computed = true;
    }
  }

  // Eager by default, lazy only if explicitly requested
  if (!options?.lazy) {
    update();
  }

  return () => {
    // Lazy: compute on first read
    if (!comp.computed) {
      update();
    }
    if (comp.error) {
      throw comp.error;
    }
    return comp.value;
  };
}

/** Process async results from a computation (Promise / AsyncIterable) */
function processResult<T>(comp: ServerComputation<T>, result: any, owner: Owner, ctx: any) {
  const id = owner.id;
  const uninitialized = comp.value === undefined;

  if (result instanceof Promise) {
    result.then(
      (v: T) => {
        (result as any).s = 1;
        (result as any).v = comp.value = v;
        comp.error = undefined; // clear NotReadyError after resolution
      },
      () => {} // rejection handled downstream by Loading's IIFE catch
    );
    if (ctx?.serialize && id) ctx.serialize(id, result);
    if (uninitialized) {
      comp.error = new NotReadyError(result);
    }
    return;
  }

  const iterator = result?.[Symbol.asyncIterator];
  if (typeof iterator === "function") {
    const iter = iterator.call(result);
    const promise = iter.next().then(
      (v: IteratorResult<T>) => {
        (promise as any).s = 1;
        (promise as any).v = comp.value = v.value;
        comp.error = undefined; // clear NotReadyError after resolution
      },
      () => {} // rejection handled downstream by Loading's IIFE catch
    );
    if (ctx?.serialize && id) ctx.serialize(id, promise);
    if (uninitialized) {
      comp.error = new NotReadyError(promise);
    }
    return;
  }

  // Synchronous value
  comp.value = result;
}

// === Effects (mostly no-ops on server) ===

export function createEffect<Next>(
  compute: ComputeFunction<undefined | NoInfer<Next>, Next>,
  effectFn: EffectFunction<NoInfer<Next>, Next> | EffectBundle<NoInfer<Next>, Next>
): void;
export function createEffect<Next, Init = Next>(
  compute: ComputeFunction<Init | Next, Next>,
  effect: EffectFunction<Next, Next> | EffectBundle<Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createEffect<Next, Init>(
  compute: ComputeFunction<Init | Next, Next>,
  effect: EffectFunction<Next, Next> | EffectBundle<Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  // No-op on server, but allocate computation ID for hydration tree alignment
  const o = getOwner();
  if (o?.id != null) getNextChildId(o);
}

export function createRenderEffect<Next>(
  compute: ComputeFunction<undefined | NoInfer<Next>, Next>,
  effectFn: EffectFunction<NoInfer<Next>, Next>
): void;
export function createRenderEffect<Next, Init = Next>(
  compute: ComputeFunction<Init | Next, Next>,
  effectFn: EffectFunction<Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createRenderEffect<Next, Init>(
  compute: ComputeFunction<Init | Next, Next>,
  effectFn: EffectFunction<Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  // Render effects: compute once and run effect once on server
  const owner = createOwner();
  try {
    const result = runWithOwner(owner, () =>
      runWithObserver(
        { owner, value: value as any, compute: compute as any, error: undefined, computed: true },
        () => (compute as ComputeFunction<any, Next>)(value as any)
      )
    );
    effectFn(result as any, value as any);
  } catch (err) {
    // Swallow errors from render effects on server
  }
}

export function createTrackedEffect(
  compute: () => void | (() => void),
  options?: EffectOptions
): void {
  // No-op on server, but allocate computation ID
  const o = getOwner();
  if (o?.id != null) getNextChildId(o);
}

export function createReaction(
  effectFn: EffectFunction<undefined> | EffectBundle<undefined>,
  options?: EffectOptions
) {
  return (tracking: () => void) => {
    tracking();
  };
}

// === Optimistic ===

export function createOptimistic<T>(): Signal<T | undefined>;
export function createOptimistic<T>(
  value: Exclude<T, Function>,
  options?: SignalOptions<T>
): Signal<T>;
export function createOptimistic<T>(
  fn: ComputeFunction<T>,
  initialValue?: T,
  options?: SignalOptions<T>
): Signal<T>;
export function createOptimistic<T>(
  first?: T | ComputeFunction<T>,
  second?: T | SignalOptions<T>,
  third?: SignalOptions<T>
): Signal<T | undefined> {
  // On server, optimistic is the same as regular signal
  return (createSignal as Function)(first, second, third);
}

// === Store (plain objects, no proxy) ===

function setProperty(state: any, property: PropertyKey, value: any) {
  if (state[property] === value) return;
  if (value === undefined) {
    delete state[property];
  } else state[property] = value;
}

export function createStore<T extends object>(
  state: T | Store<T>
): [get: Store<T>, set: StoreSetter<T>] {
  function setStore(fn: (state: T) => void): void {
    fn(state as T);
  }
  return [state as Store<T>, setStore as StoreSetter<T>];
}

export const createOptimisticStore = createStore;

export function createProjection<T extends object>(
  fn: (draft: T) => void,
  initialValue: T = {} as T
): Store<T> {
  const [state] = createStore(initialValue);
  fn(state as T);
  return state;
}

export function reconcile<T extends U, U extends object>(value: T): (state: U) => T {
  return state => {
    if (!isWrappable(state) || !isWrappable(value)) return value;
    const targetKeys = Object.keys(value) as (keyof T)[];
    const previousKeys = Object.keys(state) as (keyof T)[];
    for (let i = 0, len = targetKeys.length; i < len; i++) {
      const key = targetKeys[i];
      setProperty(state, key, value[key]);
    }
    for (let i = 0, len = previousKeys.length; i < len; i++) {
      if (value[previousKeys[i]] === undefined) setProperty(state, previousKeys[i], undefined);
    }
    return state as T;
  };
}

export function deep<T extends object>(store: Store<T>): Store<T> {
  return store;
}

// === Array mapping ===

export function mapArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: Accessor<number>) => U,
  options: { keyed?: boolean | ((item: T) => any); fallback?: Accessor<any> } = {}
): () => U[] {
  const root = getOwner()!;
  const id = getNextChildId(root);
  return () => {
    const items = list();
    let s: U[] = [];
    if (items && items.length) {
      for (let i = 0, len = items.length; i < len; i++) {
        const o = createOwner({ id: id + i });
        s.push(
          runWithOwner(o, () =>
            mapFn(
              () => items[i],
              () => i
            )
          )
        );
      }
    } else if (options.fallback) s = [options.fallback()];
    return s;
  };
}

export function repeat<T>(
  count: Accessor<number>,
  mapFn: (i: number) => T,
  options: { fallback?: Accessor<any>; from?: Accessor<number | undefined> } = {}
): () => T[] {
  const len = count();
  const offset = options.from?.() || 0;
  let s: T[] = [];
  if (len) {
    for (let i = 0; i < len; i++) s.push(mapFn(i + offset));
  } else if (options.fallback) s = [options.fallback()];
  return () => s;
}

// === Boundary primitives ===

const ErrorContext: Context<((err: any) => void) | null> = {
  id: Symbol("ErrorContext"),
  defaultValue: null
};

export { ErrorContext };

export function createErrorBoundary<U>(
  fn: () => any,
  fallback: (error: unknown, reset: () => void) => U
): () => unknown {
  const ctx = sharedConfig.context;
  const owner = createOwner();
  return runWithOwner(owner, () => {
    let result: any;

    setContext(ErrorContext, (err: any) => {
      if (ctx && !ctx.noHydrate && owner.id) ctx.serialize(owner.id, err);
      result = fallback(err, () => {});
    });

    try {
      result = fn();
    } catch (err) {
      if (ctx && !ctx.noHydrate && owner.id) ctx.serialize(owner.id, err);
      result = fallback(err, () => {});
    }
    return () => result;
  });
}

export function createLoadBoundary(fn: () => any, fallback: () => any): () => unknown {
  // On server, try to run fn. If NotReadyError is thrown, return fallback.
  // Full HydrationContext integration happens in the Loading component wrapper.
  try {
    const result = fn();
    return () => result;
  } catch (err) {
    if (err instanceof NotReadyError) {
      return () => fallback();
    }
    throw err;
  }
}

// === Utilities ===

export function untrack<T>(fn: () => T): T {
  return fn();
}

export function flush() {}

export function resolve<T>(fn: () => T): Promise<T> {
  throw new Error("resolve is not implemented on the server");
}

export function isPending(fn: () => any, fallback?: boolean): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    if (err instanceof NotReadyError && arguments.length > 1) {
      return fallback!;
    }
    throw err;
  }
}

export function pending<T>(fn: () => T): T {
  return fn();
}

export function isRefreshing(): boolean {
  return false;
}

export function refresh<T>(fn: () => T): T {
  return fn();
}

export function action<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

export function onSettled(callback: () => void | (() => void)): void {
  // No-op on server, but allocate computation ID for hydration tree alignment
  // (on the client, onSettled calls createTrackedEffect which allocates an ID)
  const o = getOwner();
  if (o?.id != null) getNextChildId(o);
}

// NoInfer utility type (also re-exported from signals, but define for local use)
type NoInfer<T extends any> = [T][T extends any ? 0 : never];
