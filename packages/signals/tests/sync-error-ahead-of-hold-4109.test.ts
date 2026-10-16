/**
 * #4109 — a sync memo that throws on a write recomputes before the async
 * sibling that will hold the frame. Its pass found no hold yet, so the error
 * published at once: an untracked read (a click handler) threw while the
 * screen still showed the button. D-41: the seam decides whether the flush
 * parks, so the error is staged like a value and shows with its frame.
 */
import { expect, it } from "vitest";
import {
  createEffect,
  createErrorBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest
} from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => (resolve = res));
  return { promise, resolve };
}
const tick = async () => {
  await new Promise(r => setTimeout(r, 0));
  flush();
};

it.each([false, true])(
  "a held sync throw waits for its frame (sibling created first: %s)",
  async siblingFirst => {
    let sibling = deferred<number>();
    const [count, setCount] = createSignal(1);
    const screen = { button: undefined as unknown, slow: 0 };
    const log: unknown[] = [];
    let condition!: () => boolean;
    const dispose = createRoot(d => {
      const slowMemo = () =>
        createMemo(() => {
          count();
          return sibling.promise;
        });
      const slow = siblingFirst ? slowMemo() : undefined;
      condition = createMemo(() => {
        if (count() === 2) throw new Error("Condition failed");
        return true;
      });
      const errored = createErrorBoundary(condition, e => `Error ${(e() as Error).message}`);
      createRenderEffect(errored, v => void (screen.button = v), { schedule: true });
      createRenderEffect(slow ?? slowMemo(), v => void (screen.slow = v), { schedule: true });
      createEffect(condition, { effect: v => void log.push(v), error: e => void log.push(e) });
      return d;
    });
    const click = () => {
      try {
        return condition();
      } catch (e) {
        return (e as Error).cause ?? e;
      }
    };
    try {
      flush();
      sibling.resolve(1);
      await tick();
      expect(screen).toEqual({ button: true, slow: 1 });
      expect(log).toEqual([true]);

      sibling = deferred();
      setCount(2);
      flush();
      expect(screen).toEqual({ button: true, slow: 1 });
      expect(log).toEqual([true]);
      expect(click()).toBe(true);
      expect(isPending(condition)).toBe(true);
      expect(() => latest(condition)).toThrow("Condition failed");

      sibling.resolve(2);
      await tick();
      expect(screen).toEqual({ button: "Error Condition failed", slow: 2 });
      expect(log.length).toBe(2);
      expect((log[1] as Error).message).toBe("Condition failed");
      expect((click() as Error).message).toBe("Condition failed");
      expect(isPending(condition)).toBe(false);
    } finally {
      dispose();
      flush();
    }
  }
);
