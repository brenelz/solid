/**
 * #4444: `owner.dispose` passed as a bare callback (`queueMicrotask(o.dispose)`)
 * tears the owner down like a call through the owner does.
 */
import { expect, it } from "vitest";
import {
  createOwner,
  createRenderEffect,
  createSignal,
  isDisposed,
  onCleanup,
  runWithOwner
} from "../src/index.js";

const tick = () => new Promise(r => setTimeout(r, 0));

it("#4444: an owner's dispose works detached from the owner", async () => {
  const [count, setCount] = createSignal(0);
  const runs: number[] = [];
  let cleaned = false;
  const o = createOwner();
  runWithOwner(o, () => {
    createRenderEffect(count, v => void runs.push(v), { schedule: true });
    onCleanup(() => (cleaned = true));
    queueMicrotask(o.dispose);
  });
  await tick();
  expect(isDisposed(o)).toBe(true);
  expect(cleaned).toBe(true);
  expect(runs).toEqual([0]);
  setCount(1);
  await tick();
  expect(runs).toEqual([0]);
});

it("#4444: a detached dispose still takes the self flag", () => {
  let cleaned = false;
  const o = createOwner();
  runWithOwner(o, () => onCleanup(() => (cleaned = true)));
  const { dispose } = o;
  dispose(false);
  expect(cleaned).toBe(true);
  expect(isDisposed(o)).toBe(false);
  dispose();
  expect(isDisposed(o)).toBe(true);
});

it("#4444: a detached dispose handed a falsy value still disposes the owner", async () => {
  let cleaned = false;
  const o = createOwner();
  runWithOwner(o, () => onCleanup(() => (cleaned = true)));
  await Promise.resolve(null).then(o.dispose);
  expect(cleaned).toBe(true);
  expect(isDisposed(o)).toBe(true);
});

it("#4444: a child's dispose registered as a parent's cleanup tears the child down", () => {
  let cleaned = false;
  const parent = createOwner();
  const child = runWithOwner(parent, () => createOwner())!;
  runWithOwner(child, () => onCleanup(() => (cleaned = true)));
  runWithOwner(parent, () => onCleanup(child.dispose));
  parent.dispose();
  expect(cleaned).toBe(true);
  expect(isDisposed(child)).toBe(true);
  expect(isDisposed(parent)).toBe(true);
});
