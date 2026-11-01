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

it("a chain reached once by the settle walk keeps its verdict pending until the commit", async () => {
  const [s, setS] = createSignal(0);
  const log: unknown[] = [];
  let release!: () => void;
  const dispose = createRoot(d => {
    const A = createMemo(async () => {
      const v = s();
      await Promise.resolve();
      if (v === 2) throw new Error("boomA");
      return v;
    });
    const B = createMemo(() => A() + 1);
    const C = createMemo(() => B() + 2);
    const D = createMemo(() => C());
    const view = createErrorBoundary(
      () => `${isPending(D)}:` + D(),
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
  expect(log).toEqual(["false:3", "true:3", "E:boomA", "false:6"]);
  dispose();
});
