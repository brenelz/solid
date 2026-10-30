/**
 * #4468 — a memo's own `isPending()` of a held write answers the same
 * whoever wakes the memo (A31, D-25).
 *
 * `verdictValue` pulls a dirty memo with the dispatch closed, but left
 * `latestActive` set for the pulled pass: an `isPending()` the memo calls
 * itself ran as if inside the outer `latest()`, where `heldNotFinal` answers
 * final. Pulled inside `latest(() => m())` the memo saw `false`; woken by a
 * plain read first, `true`. The `probing` half is #4429.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  action,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest
} from "../src/index.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe("#4468: a memo pulled inside latest() computes as its own pass", () => {
  for (const form of ["pulled", "plainFirst"] as const)
    it(`the memo's own isPending(held x) is the same whoever wakes it (${form})`, async () => {
      const [x, setX] = createSignal(0);
      const [s, setS] = createSignal(0);
      const [on, setOn] = createSignal(false);
      const seen: unknown[] = [];
      createRoot(() => {
        createRenderEffect(x, () => {});
        const sa = createMemo(() => s());
        const m = createMemo(() => `${sa()}:${isPending(x)}`);
        createRenderEffect(
          () => (on() ? (form === "pulled" ? latest(() => m()) : (m(), latest(m))) : "off"),
          v => void seen.push(v)
        );
      });
      flush();
      action(function* () {
        setX(1);
        yield sleep(100);
      })();
      flush();
      setS(1);
      setOn(true);
      flush();
      expect(seen[seen.length - 1]).toBe("1:true");
      await vi.advanceTimersByTimeAsync(150);
      flush();
      expect(seen[seen.length - 1]).toBe("1:false");
    });
});
