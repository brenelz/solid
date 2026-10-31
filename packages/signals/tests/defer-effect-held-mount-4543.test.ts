import { describe, expect, it } from "vitest";
import {
  action,
  createEffect,
  createLoadingBoundary,
  createMemo,
  createOptimistic,
  createReaction,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  untrack
} from "../src/index.js";

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  flush();
};

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

function heldSignal() {
  const [x, setX] = createSignal(0);
  createRoot(() => {
    createRenderEffect(x, () => {});
  });
  flush();
  let release!: () => void;
  const run = action(function* () {
    setX(1);
    yield new Promise<void>(r => (release = r));
  });
  const pending = run();
  flush();
  return { x, release: () => (release(), pending) };
}

describe("#4543: a deferred effect born under a held mount", () => {
  it("skips its first run when the mount is not held", async () => {
    expect(await mountChild(false)).toEqual({ atMount: [], runs: [[2]] });
  });

  it("skips its first run when the mount is held by an async memo", async () => {
    expect(await mountChild(true)).toEqual({ atMount: [], runs: [[2]] });
  });

  it("runs once at the commit with a source change made during the hold", async () => {
    const { x, release } = heldSignal();
    const [title, setTitle] = createSignal("");
    const runs: unknown[] = [];
    createRoot(() => {
      const m = createMemo(() => x());
      createEffect(
        () => [m(), title()],
        v => {
          runs.push(v);
        },
        { defer: true }
      );
    });
    flush();
    setTitle("t");
    flush();
    expect(runs).toEqual([]);
    await release();
    await settle();
    expect(runs).toEqual([[1, "t"]]);
    setTitle("u");
    flush();
    expect(runs).toEqual([
      [1, "t"],
      [1, "u"]
    ]);
  });

  it("a reaction armed under a hold fires once at the commit when its source changes", async () => {
    const { x, release } = heldSignal();
    const [title, setTitle] = createSignal("");
    let fired = 0;
    createRoot(() => {
      const m = createMemo(() => x());
      const track = createReaction(() => {
        fired++;
      });
      track(() => (m(), title()));
    });
    flush();
    setTitle("t");
    flush();
    expect(fired).toBe(0);
    await release();
    await settle();
    expect(fired).toBe(1);
  });

  it("skips its first run when the mount is a lane's work", async () => {
    const [enabled, setEnabled] = createSignal(false);
    const [visible, setVisible] = createOptimistic(enabled);
    const runs: unknown[] = [];
    let setLocal!: (v: number) => void;
    let release!: () => void;
    const run = action(function* () {
      setEnabled(true);
      setVisible(true);
      yield new Promise<void>(r => (release = r));
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
    let screen: unknown;
    createRoot(() => {
      const content = createMemo(() => (visible() ? untrack(child) : "A"));
      createRenderEffect(content, v => {
        screen = v;
      });
    });
    flush();
    expect(screen).toBe("A");
    const p = run();
    flush();
    await settle();
    expect(screen).toBe("B");
    expect(runs).toEqual([]);
    release();
    await p;
    await settle();
    expect(screen).toBe("B");
    expect(runs).toEqual([]);
    setLocal(2);
    flush();
    expect(runs).toEqual([[2]]);
  });
});
