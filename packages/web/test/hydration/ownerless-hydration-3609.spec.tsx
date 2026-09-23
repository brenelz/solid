/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  createMemo,
  createOptimistic,
  createProjection,
  createRoot,
  createSignal,
  createStore,
  flush,
  runWithOwner
} from "solid-js";
import { hydrate } from "@solidjs/web";

const container = document.createElement("div");
let dispose: (() => void) | undefined;

beforeEach(() => {
  (globalThis as any)._$HY = { events: [], completed: new WeakSet(), r: { "0": 42 }, fe() {} };
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

test("an ownerless createMemo during hydrate() computes and consumes no hydration id", () => {
  let detached!: () => number;
  let owned!: () => number;
  dispose = hydrate(() => {
    detached = runWithOwner(null, () => createMemo(() => 1))!;
    owned = createMemo(() => 2);
    return null;
  }, container);
  flush();
  expect(detached()).toBe(1);
  expect(owned()).toBe(42);
});

test("an ownerless function-form createSignal during hydrate() computes and consumes no hydration id", () => {
  let detached!: () => number;
  let owned!: () => number;
  dispose = hydrate(() => {
    [detached] = runWithOwner(null, () => createSignal(() => 1))!;
    owned = createMemo(() => 2);
    return null;
  }, container);
  flush();
  expect(detached()).toBe(1);
  expect(owned()).toBe(42);
});

test("an ownerless createOptimistic during hydrate() computes", () => {
  let detached!: () => number;
  dispose = hydrate(() => {
    [detached] = runWithOwner(null, () => createOptimistic(() => 1))!;
    return null;
  }, container);
  flush();
  expect(detached()).toBe(1);
});

test("an ownerless function-form createStore during hydrate() computes and consumes no hydration id", () => {
  let detached!: { n: number };
  let owned!: () => number;
  dispose = hydrate(() => {
    [detached] = runWithOwner(null, () =>
      createStore<{ n: number }>(
        draft => {
          draft.n = 1;
        },
        { n: 0 }
      )
    )!;
    owned = createMemo(() => 2);
    return null;
  }, container);
  flush();
  expect(detached.n).toBe(1);
  expect(owned()).toBe(42);
});

test("an ownerless createProjection during hydrate() computes", () => {
  let detached!: { n: number };
  dispose = hydrate(() => {
    detached = runWithOwner(null, () =>
      createProjection<{ n: number }>(
        draft => {
          draft.n = 1;
        },
        { n: 0 }
      )
    )!;
    return null;
  }, container);
  flush();
  expect(detached.n).toBe(1);
});

test("a memo under an owner without an id computes during hydrate()", () => {
  let value!: () => number;
  dispose = hydrate(() => {
    runWithOwner(null, () => {
      createRoot(() => {
        value = createMemo(() => 1);
      });
    });
    return null;
  }, container);
  flush();
  expect(value()).toBe(1);
});

test("a transparent function-form createSignal computes instead of adopting its owner's serialized value", () => {
  let value!: () => number;
  dispose = hydrate(() => {
    createRoot(() => {
      [value] = createSignal(() => 1, { transparent: true });
    });
    return null;
  }, container);
  flush();
  expect(value()).toBe(1);
});
