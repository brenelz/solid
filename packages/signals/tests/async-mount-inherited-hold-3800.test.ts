import { describe, expect, it } from "vitest";
import { createMemo, createRenderEffect, createRoot, createSignal, flush } from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  flush();
};

function slowSource() {
  const [count, setCount] = createSignal(1);
  const answers: Array<() => void> = [];
  const slow = createMemo(() => {
    const value = count();
    return new Promise<number>(resolve => answers.push(() => resolve(value)));
  });
  const parent: string[] = [];
  createRoot(() => {
    createRenderEffect(
      () => [count(), slow()] as const,
      ([c, s]) => {
        parent.push(`${c} ${s}`);
      },
      { schedule: true }
    );
  });
  return { count, setCount, answers, parent };
}

describe("a newly created async memo over a held signal (#3800)", () => {
  it("an async first result keeps the inherited hold until the slow derivation lands", async () => {
    const { count, setCount, answers, parent } = slowSource();
    flush();
    answers.splice(0).forEach(answer => answer());
    await tick();
    expect(parent).toEqual(["1 1"]);

    setCount(2);
    flush();
    const child: number[] = [];
    createRoot(() => {
      const memo = createMemo(() => Promise.resolve(count()));
      createRenderEffect(
        memo,
        v => {
          child.push(v);
        },
        { schedule: true }
      );
    });
    flush();
    await tick();
    expect(child).toEqual([]);
    expect(parent).toEqual(["1 1"]);

    answers.splice(0).forEach(answer => answer());
    await tick();
    expect(parent).toEqual(["1 1", "2 2"]);
    expect(child).toEqual([2]);
  });

  it("a synchronous first result keeps the inherited hold (control)", async () => {
    const { count, setCount, answers, parent } = slowSource();
    flush();
    answers.splice(0).forEach(answer => answer());
    await tick();
    expect(parent).toEqual(["1 1"]);

    setCount(2);
    flush();
    const child: number[] = [];
    createRoot(() => {
      const memo = createMemo(() => count());
      createRenderEffect(
        memo,
        v => {
          child.push(v);
        },
        { schedule: true }
      );
    });
    flush();
    await tick();
    expect(child).toEqual([]);
    expect(parent).toEqual(["1 1"]);

    answers.splice(0).forEach(answer => answer());
    await tick();
    expect(parent).toEqual(["1 1", "2 2"]);
    expect(child).toEqual([2]);
  });
});
