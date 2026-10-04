import { afterEach, describe, expect, it } from "vitest";
import {
  action,
  createMemo,
  createOptimistic,
  createRenderEffect,
  createRoot,
  createSignal,
  flush
} from "../src/index.js";

afterEach(() => flush());

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  flush();
}

function primed() {
  const flights: Array<() => void> = [];
  let x!: () => number;
  let setX!: (v: number) => void;
  let sign!: () => boolean;
  let dispose!: () => void;
  createRoot(d => {
    dispose = d;
    [x, setX] = createOptimistic(0);
    sign = createMemo(() => x() >= 0);
    const downstream = createMemo(() => {
      const n = x();
      return new Promise<number>(r => flights.push(() => r(n)));
    });
    createRenderEffect(downstream, () => {});
  });
  flush();
  flights.shift()!();
  return { flights, x, setX, sign, dispose };
}

describe("a leaf reading a held, never-shown lane's uncommitted node (#3766)", () => {
  it("mounts at the parent's landing when a body-end correction dissolves the lane", async () => {
    const { flights, x, setX, sign, dispose } = primed();
    await settle();
    let endBody!: () => void;
    action(function* () {
      setX(1);
      yield new Promise<void>(r => (endBody = r));
    })();
    flush();
    expect(flights.length).toBe(1);

    const applied: string[] = [];
    let landG!: (v: string) => void;
    let disposeLeaf!: () => void;
    createRoot(d => {
      disposeLeaf = d;
      const g = createMemo(() => new Promise<string>(r => (landG = r)));
      const m = createMemo(() => {
        const s = sign();
        const v = g();
        return s ? v : "b";
      });
      createRenderEffect(m, v => {
        applied.push(v);
      });
    });
    flush();
    landG("a");
    await settle();
    expect(applied).toEqual([]);

    endBody();
    await settle();
    await settle();
    expect(x()).toBe(0);
    expect(flights.length).toBe(2);
    expect(applied).toEqual([]);

    for (const f of flights.splice(0)) f();
    await settle();
    await settle();
    expect(applied).toEqual(["a"]);
    disposeLeaf();
    dispose();
  });

  it("re-run while the node is in flight again, waits on it and applies at the reveal", async () => {
    const { flights, x, setX, dispose } = primed();
    await settle();
    const [u, setU] = createSignal(0);
    let next!: () => void;
    action(function* () {
      setX(1);
      yield new Promise<void>(r => (next = r));
      setX(2);
      yield new Promise<void>(() => {});
    })();
    flush();
    expect(flights.length).toBe(1);

    const applied: [number, string][] = [];
    let landG!: (v: string) => void;
    let landM!: (v: string) => void;
    let disposeLeaf!: () => void;
    createRoot(d => {
      disposeLeaf = d;
      const g = createMemo(() => new Promise<string>(r => (landG = r)));
      const m = createMemo(() => {
        const n = x();
        const v = g();
        return n === 2 ? new Promise<string>(r => (landM = r)) : v + n;
      });
      createRenderEffect(
        () => [u(), m()] as [number, string],
        v => {
          applied.push(v);
        }
      );
    });
    flush();
    landG("a");
    await settle();
    expect(applied).toEqual([]);

    next();
    await settle();
    expect(flights.length).toBe(2);
    setU(1);
    flush();
    expect(applied).toEqual([]);

    landM("two");
    await settle();
    expect(applied).toEqual([]);

    for (const f of flights.splice(0)) f();
    await settle();
    await settle();
    expect(applied).toEqual([[1, "two"]]);
    disposeLeaf();
    dispose();
  });
});
