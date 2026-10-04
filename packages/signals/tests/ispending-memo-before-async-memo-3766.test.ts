import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemo, createRenderEffect, createRoot, flush, isPending } from "../src/index.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  flush();
  vi.useRealTimers();
});

const delay = <T>(ms: number, value: T) => new Promise<T>(r => setTimeout(r, ms, value));
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("memo over isPending read before an initially async memo (#3766)", () => {
  function stage(read: (pending: () => boolean, gate: () => number) => [boolean, number]) {
    const applied: [boolean, number][] = [];
    createRoot(() => {
      const source = createMemo(() => delay(100, 10));
      const gate = createMemo(() => delay(200, 100));
      const pending = createMemo(() => isPending(source));
      createRenderEffect(
        () => read(pending, gate),
        v => {
          applied.push(v);
        }
      );
    });
    flush();
    return applied;
  }

  it("applies the effect once both flights land when pending() is read first", async () => {
    const applied = stage((pending, gate) => [pending(), gate()]);
    await advance(300);
    flush();
    expect(applied).toEqual([[false, 100]]);
  });

  it("applies the effect once both flights land when gate() is read first", async () => {
    const applied = stage((pending, gate) => {
      const g = gate();
      return [pending(), g];
    });
    await advance(300);
    flush();
    expect(applied).toEqual([[false, 100]]);
  });
});
