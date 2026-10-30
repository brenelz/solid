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
