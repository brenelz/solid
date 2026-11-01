import { afterEach, expect, it } from "vitest";
import {
  action,
  createErrorBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  resetErrorHalt
} from "../src/index.js";

afterEach(() => resetErrorHalt());

const tick = async () => {
  await new Promise(r => setTimeout(r, 0));
  flush();
};

it("a long memo chain's settle walk stages the source's error without overflowing the stack (#4587)", async () => {
  const N = 8000;
  const [s, setS] = createSignal(0);
  const log: unknown[] = [];
  let release!: () => void;
  let A!: () => number;
  const disposeSource = createRoot(d => {
    A = createMemo(async () => {
      const v = s();
      await Promise.resolve();
      if (v === 2) throw new Error("boomA");
      return v;
    });
    return d;
  });
  await tick();
  const dispose = createRoot(d => {
    let last = A;
    for (let i = 0; i < N; i++) {
      const prev = last;
      last = createMemo(() => prev() + 1);
      last();
    }
    const view = createErrorBoundary(
      () => `${isPending(last)}:` + last(),
      e => `E:${(e() as Error).message}`
    );
    createRenderEffect(view, v => void log.push(v));
    return d;
  });
  await tick();
  setS(1);
  flush();
  action(function* () {
    setS(2);
    yield new Promise<void>(r => (release = r));
  })();
  await tick();
  release();
  await tick();
  await tick();
  setS(3);
  flush();
  await tick();
  await tick();
  expect(log).toEqual([`false:${N}`, `true:${N}`, "E:boomA", `false:${N + 3}`]);
  dispose();
  disposeSource();
});

it("a long memo chain's silent-recovery sweep reaches the chain's end without overflowing the stack", () => {
  const N = 8000;
  const [b, setB] = createSignal(0);
  const log: unknown[] = [];
  const dispose = createRoot(d => {
    let last = createMemo(() => {
      const v = b();
      if (v < 0) throw new Error(`b=${v}`);
      return v;
    });
    for (let i = 0; i < N; i++) {
      const prev = last;
      last = createMemo(() => prev());
    }
    const end = last;
    const view = createErrorBoundary(
      () => `ok:${end()}`,
      e => `err:${(e() as Error).message}`
    );
    createRenderEffect(view, v => void log.push(v));
    return d;
  });
  flush();
  setB(-1);
  flush();
  setB(0);
  flush();
  expect(log).toEqual(["ok:0", "err:b=-1", "ok:0"]);
  dispose();
});
