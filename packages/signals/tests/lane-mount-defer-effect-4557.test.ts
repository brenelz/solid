import { describe, expect, it } from "vitest";
import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  untrack
} from "../src/index.js";

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  flush();
}

async function mount(defer: boolean) {
  const log: string[] = [];
  const [opt, setOpt] = createOptimistic(false);
  const [n, setN] = createSignal(1);
  let release!: () => void;
  const run = action(function* () {
    setOpt(true);
    yield new Promise<void>(r => (release = r));
  });
  let dispose!: () => void;
  createRoot(d => {
    dispose = d;
    const content = createMemo(() =>
      opt()
        ? untrack(() => {
            createRenderEffect(
              () => n(),
              (v, prev) => void log.push(`render ${v} prev ${prev}`),
              { defer }
            );
            createEffect(
              () => n(),
              (v, prev) => void log.push(`user ${v} prev ${prev}`),
              { defer }
            );
            return "child";
          })
        : undefined
    );
    createRenderEffect(content, () => {});
  });
  flush();
  const p = run();
  flush();
  await settle();
  const mounted = log.splice(0);
  setN(2);
  flush();
  await settle();
  const written = log.splice(0);
  release();
  await p;
  await settle();
  dispose();
  return { mounted, written, landed: log };
}

describe("#4557 effects mounted by a lane", () => {
  it("defer skips the first run under a lane's mount", async () => {
    expect(await mount(true)).toEqual({
      mounted: [],
      written: ["render 2 prev undefined", "user 2 prev undefined"],
      landed: []
    });
  });

  it("a later write runs each effect once", async () => {
    expect(await mount(false)).toEqual({
      mounted: ["render 1 prev undefined", "user 1 prev undefined"],
      written: ["render 2 prev 1", "user 2 prev 1"],
      landed: []
    });
  });

  it("a write whose seam the lane blocks runs a reader of its memo once", async () => {
    const log: string[] = [];
    const [opt, setOpt] = createOptimistic(false);
    const [n, setN] = createSignal(1);
    const [k, setK] = createSignal(0);
    let release!: () => void;
    let resolveA!: (v: string) => void;
    const run = action(function* () {
      setOpt(true);
      yield new Promise<void>(r => (release = r));
    });
    let dispose!: () => void;
    createRoot(d => {
      dispose = d;
      const content = createMemo(() =>
        opt()
          ? untrack(() => {
              const m = createMemo(() => n());
              createEffect(
                () => m(),
                v => void log.push(`user ${v}`)
              );
              const a = createMemo(() => (k() ? new Promise<string>(r => (resolveA = r)) : "a0"));
              createRenderEffect(
                () => a(),
                v => void log.push(`a ${v}`)
              );
              return "child";
            })
          : undefined
      );
      createRenderEffect(content, () => {});
    });
    flush();
    const p = run();
    flush();
    await settle();
    const mounted = log.splice(0);
    setN(2);
    setK(1);
    flush();
    await settle();
    const written = log.splice(0);
    resolveA("a1");
    await settle();
    const revealed = log.splice(0);
    release();
    await p;
    await settle();
    dispose();
    expect({ mounted, written, revealed, landed: log }).toEqual({
      mounted: ["a a0", "user 1"],
      written: ["user 2"],
      revealed: ["a a1"],
      landed: []
    });
  });
});
