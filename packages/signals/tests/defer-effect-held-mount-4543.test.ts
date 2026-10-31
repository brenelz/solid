import { describe, expect, it } from "vitest";
import {
  createEffect,
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  untrack
} from "../src/index.js";

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function mountChild(held: boolean) {
  const runs: unknown[] = [];
  const [path, setPath] = createSignal("a");
  let screen: unknown;
  let setLocal!: (v: number) => void;
  let dispose!: () => void;

  createRoot(d => {
    dispose = d;
    const matched = createMemo(() => {
      const p = path();
      return p === "a" || !held ? p : wait(10).then(() => p);
    });
    const child = () => {
      const [local, set] = createSignal(1);
      setLocal = set;
      const keys = createMemo(() => [local()]);
      createEffect(
        () => keys(),
        k => {
          runs.push(k);
        },
        { defer: true }
      );
      return "B";
    };
    const boundary = createLoadingBoundary(
      () => {
        const when = createMemo(() => matched() === "b");
        return createMemo(() => (when() ? untrack(child) : "A"));
      },
      () => "root"
    );
    createRenderEffect(boundary, v => {
      screen = v;
    });
  });
  flush();
  expect(screen).toBe("A");

  setPath("b");
  flush();
  await wait(80);
  flush();
  expect(screen).toBe("B");
  const atMount = [...runs];

  setLocal(2);
  flush();
  dispose();
  return { atMount, runs };
}

describe("#4543: a deferred effect born under a held mount", () => {
  it("skips its first run when the mount is not held", async () => {
    expect(await mountChild(false)).toEqual({ atMount: [], runs: [[2]] });
  });

  it("skips its first run when the mount is held by an async memo", async () => {
    expect(await mountChild(true)).toEqual({ atMount: [], runs: [[2]] });
  });
});
