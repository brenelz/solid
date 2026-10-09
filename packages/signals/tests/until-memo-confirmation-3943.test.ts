import { expect, test } from "vitest";
import {
  action,
  createMemo,
  createOptimistic,
  createRoot,
  createSignal,
  flush,
  until
} from "../src/index.js";

test("confirming an optimistic guess satisfies until through a synchronous memo (#3943)", async () => {
  const [source, setSource] = createSignal(0);
  let count!: () => number;
  let guess!: (v: number) => void;
  let doubled!: () => number;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [c, g] = createOptimistic(() => source());
    count = c;
    guess = g;
    doubled = createMemo(() => count() * 2);
  });

  const save = action(function* () {
    guess(1);
    yield Promise.resolve();
    yield until(() => doubled() === 2, { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 20));
  expect(count()).toBe(1);
  expect(doubled()).toBe(2);

  setSource(1);
  flush();

  await expect(done).resolves.toBe("confirmed");
  dispose();
});

test("confirming an optimistic guess satisfies until through a direct read (#3943)", async () => {
  const [source, setSource] = createSignal(0);
  let count!: () => number;
  let guess!: (v: number) => void;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [c, g] = createOptimistic(() => source());
    count = c;
    guess = g;
  });

  const save = action(function* () {
    guess(1);
    yield Promise.resolve();
    yield until(() => count() === 1, { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 20));
  setSource(1);
  flush();

  await expect(done).resolves.toBe("confirmed");
  dispose();
});
