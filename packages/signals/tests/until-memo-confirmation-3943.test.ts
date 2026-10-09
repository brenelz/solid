import { expect, test } from "vitest";
import {
  action,
  createMemo,
  createOptimistic,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  TimeoutError,
  untrack,
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

test("a lane memo that also reads a write the action holds does not satisfy until (#3943)", async () => {
  const [source, setSource] = createSignal(0);
  const [other, setOther] = createSignal(0);
  let count!: () => number;
  let guess!: (v: number) => void;
  let total!: () => number;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [c, g] = createOptimistic(() => source());
    count = c;
    guess = g;
    total = createMemo(() => count() * 10 + other());
  });

  const save = action(function* () {
    guess(1);
    setOther(5);
    yield Promise.resolve();
    yield until(() => total() === 10, { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 20));
  setSource(1);
  flush();

  await expect(done).resolves.toBeInstanceOf(TimeoutError);
  expect(total()).toBe(15);
  dispose();
});

test("a truth equal to the guess only by comparator does not make the guess's memo the truth (#3943)", async () => {
  const [source, setSource] = createSignal({ id: 1, name: "old" });
  let row!: () => { id: number; name: string };
  let guess!: (v: { id: number; name: string }) => void;
  let name!: () => string;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [r, g] = createOptimistic(() => source(), { equals: (a, b) => a.id === b.id });
    row = r;
    guess = g;
    name = createMemo(() => row().name);
  });

  const save = action(function* () {
    guess({ id: 2, name: "pending" });
    yield Promise.resolve();
    yield until(() => name() === "pending", { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 20));
  setSource({ id: 2, name: "saved" });
  flush();

  await expect(done).resolves.toBeInstanceOf(TimeoutError);
  dispose();
});

test("a verdict memo with no guess beneath it is not the truth (#3943)", async () => {
  const [count, setCount] = createSignal(0);
  let release!: () => void;
  let pending!: () => boolean;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const slow = createMemo(async () => {
      const v = count();
      if (v !== 0) await new Promise<void>(r => (release = r));
      return v;
    });
    const copy = createMemo(() => count());
    pending = createMemo(() => isPending(copy));
    createRenderEffect(
      () => slow(),
      () => {}
    );
    createRenderEffect(
      () => pending(),
      () => {}
    );
  });
  flush();

  setCount(1);
  flush();
  await new Promise(r => setTimeout(r, 20));
  expect(pending()).toBe(true);

  await expect(until(() => pending() === true, { timeout: 100 })).rejects.toBeInstanceOf(
    TimeoutError
  );

  release();
  await new Promise(r => setTimeout(r, 20));
  flush();
  dispose();
});

test("a guess read untracked inside lane work cannot satisfy its own confirmation (#3943)", async () => {
  const [source] = createSignal(0);
  const [other] = createSignal(0);
  let count!: () => number;
  let guess!: (v: number) => void;
  let inner!: () => number;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [c, g] = createOptimistic(() => source());
    count = c;
    guess = g;
    createMemo(() => {
      count();
      inner = createMemo(() => untrack(count) * 10 + other());
      return 0;
    });
  });
  flush();

  const save = action(function* () {
    guess(1);
    yield Promise.resolve();
    yield until(() => inner() === 10, { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 20));
  expect(inner()).toBe(10);

  await expect(done).resolves.toBeInstanceOf(TimeoutError);
  dispose();
});

test("a lane memo in flight serves until the committed value, not its stale lane value (#3943)", async () => {
  const [source, setSource] = createSignal(0);
  let count!: () => number;
  let guess!: (v: number) => void;
  let doubled!: () => number;
  let release: (() => void) | null = null;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const [c, g] = createOptimistic(() => source());
    count = c;
    guess = g;
    doubled = createMemo(async () => {
      const v = count();
      if (v === 2) await new Promise<void>(r => (release = r));
      return v * 2;
    });
  });
  flush();

  const save = action(function* () {
    guess(1);
    yield new Promise(r => setTimeout(r, 20));
    guess(2);
    yield Promise.resolve();
    yield until(() => doubled() === 2, { timeout: 100 });
  });

  const done = save().then(
    () => "confirmed" as const,
    (error: unknown) => error
  );

  await new Promise(r => setTimeout(r, 40));
  expect(release).not.toBeNull();
  setSource(2);
  flush();

  await expect(done).resolves.toBeInstanceOf(TimeoutError);
  release!();
  await new Promise(r => setTimeout(r, 20));
  flush();
  dispose();
});
