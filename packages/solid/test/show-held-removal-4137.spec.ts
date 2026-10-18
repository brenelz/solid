/**
 * #4137: an action holds the write that turns a non-keyed `<Show>` (or
 * `<Match>`) falsy, so the branch stays on screen as a zombie and re-runs for
 * live writes until the landing disposes it. The narrowed accessor must not
 * judge that branch stale by the held selection, or the child's re-run
 * throws and halts reactivity. Once the landing disposes the branch, a read
 * from its cleanups or from a leaked accessor still throws.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  action,
  createMemo,
  createOptimistic,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  Match,
  onCleanup,
  resetErrorHalt,
  Show,
  Switch
} from "../src/index.js";

afterEach(() => {
  resetErrorHalt();
  vi.restoreAllMocks();
});

function setup(flow: "show" | "match", inAction: (setGuess: (v: number) => void) => void) {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const frames: string[] = [];
  const cleanupReads: string[] = [];
  let runs = 0;
  let row!: () => string;
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const [when, setWhen] = createSignal<string | false>("row");
  const [tick, setTick] = createSignal(0);
  const [guess, setGuess] = createOptimistic(0);
  let hide!: () => Promise<void>;
  const readInCleanup = (tag: string) => () => {
    try {
      row();
      cleanupReads.push(`${tag}:ok`);
    } catch (e) {
      cleanupReads.push(/stale/i.test(String(e)) ? `${tag}:stale` : `${tag}:${e}`);
    }
  };
  const dispose = createRoot(d => {
    const children = (item: () => string) => {
      row = item;
      onCleanup(readInCleanup("direct"));
      const label = createMemo(() => {
        runs++;
        onCleanup(readInCleanup("memo"));
        return `${item()}:${tick()}:${guess()}`;
      });
      return () => label();
    };
    const view =
      flow === "show"
        ? Show({
            get when() {
              return when();
            },
            fallback: "fallback",
            children
          })
        : Switch({
            fallback: "fallback",
            get children() {
              return Match({
                get when() {
                  return when();
                },
                children
              });
            }
          });
    createRenderEffect(
      () => {
        const v = (view as () => unknown)();
        return typeof v === "function" ? v() : v;
      },
      v => {
        frames.push(String(v));
      }
    );
    hide = action(function* () {
      setWhen(false);
      inAction(setGuess);
      yield gate;
    });
    return d;
  });
  flush();
  return {
    frames,
    cleanupReads: () => [...new Set(cleanupReads)].sort(),
    runs: () => runs,
    row: () => row(),
    error,
    hide,
    release,
    setWhen,
    setTick,
    dispose
  };
}

describe.each(["show", "match"] as const)(
  "non-keyed <%s> whose removal an action holds (#4137)",
  flow => {
    test("a live write re-runs the displayed branch without a stale read", async () => {
      const { frames, cleanupReads, runs, row, error, hide, release, setWhen, setTick, dispose } =
        setup(flow, () => {});
      expect(frames).toEqual(["row:0:0"]);
      expect(runs()).toBe(1);

      const p = hide();
      flush();
      setTick(1);
      flush();
      expect(runs()).toBe(2);
      expect(error).not.toHaveBeenCalled();
      expect(frames.at(-1)).toBe("row:0:0");
      expect(row()).toBe("row");
      expect(cleanupReads()).toEqual([]);

      release();
      await p;
      flush();
      expect(frames.at(-1)).toBe("fallback");
      expect(cleanupReads()).toEqual(["direct:stale", "memo:stale"]);
      expect(() => row()).toThrow(/stale/i);
      expect(runs()).toBe(2);

      setWhen("row");
      flush();
      expect(frames.at(-1)).toBe("row:1:0");
      expect(error).not.toHaveBeenCalled();
      dispose();
    });

    test("an optimistic write in the same action re-runs the displayed branch", async () => {
      const { frames, cleanupReads, error, hide, release, setWhen, dispose } = setup(
        flow,
        setGuess => setGuess(1)
      );

      const p = hide();
      flush();
      expect(error).not.toHaveBeenCalled();
      expect(frames.at(-1)).toBe("row:0:1");
      expect(cleanupReads()).toEqual(["memo:ok"]);

      release();
      await p;
      flush();
      expect(frames.at(-1)).toBe("fallback");
      expect(cleanupReads()).toEqual(["direct:stale", "memo:ok", "memo:stale"]);

      setWhen("row");
      flush();
      expect(frames.at(-1)).toBe("row:0:0");
      expect(error).not.toHaveBeenCalled();
      dispose();
    });

    test("a cleanup of a branch removed outright reads a stale accessor", () => {
      const { frames, cleanupReads, row, setWhen, dispose } = setup(flow, () => {});

      setWhen(false);
      flush();
      expect(frames.at(-1)).toBe("fallback");
      expect(cleanupReads()).toEqual(["direct:stale", "memo:stale"]);
      expect(() => row()).toThrow(/stale/i);
      dispose();
    });
  }
);
