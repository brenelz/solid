/**
 * #4137: an action holds the write that turns a non-keyed `<Show>` (or
 * `<Match>`) falsy, so the branch stays on screen as a zombie and re-runs for
 * live writes until the landing disposes it. The narrowed accessor must not
 * judge that branch stale by the held selection, or the child's re-run
 * throws and halts reactivity.
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
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const [when, setWhen] = createSignal<string | false>("row");
  const [tick, setTick] = createSignal(0);
  const [guess, setGuess] = createOptimistic(0);
  let hide!: () => Promise<void>;
  const dispose = createRoot(d => {
    const children = (row: () => string) => {
      const label = createMemo(() => `${row()}:${tick()}:${guess()}`);
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
  return { frames, error, hide, release, setWhen, setTick, dispose };
}

describe.each(["show", "match"] as const)(
  "non-keyed <%s> whose removal an action holds (#4137)",
  flow => {
    test("a live write re-runs the displayed branch without a stale read", async () => {
      const { frames, error, hide, release, setWhen, setTick, dispose } = setup(flow, () => {});
      expect(frames).toEqual(["row:0:0"]);

      const p = hide();
      flush();
      setTick(1);
      flush();
      expect(error).not.toHaveBeenCalled();
      expect(frames.at(-1)).toBe("row:0:0");

      release();
      await p;
      flush();
      expect(frames.at(-1)).toBe("fallback");

      setWhen("row");
      flush();
      expect(frames.at(-1)).toBe("row:1:0");
      expect(error).not.toHaveBeenCalled();
      dispose();
    });

    test("an optimistic write in the same action re-runs the displayed branch", async () => {
      const { frames, error, hide, release, setWhen, dispose } = setup(flow, setGuess =>
        setGuess(1)
      );

      const p = hide();
      flush();
      expect(error).not.toHaveBeenCalled();
      expect(frames.at(-1)).toBe("row:0:1");

      release();
      await p;
      flush();
      expect(frames.at(-1)).toBe("fallback");

      setWhen("row");
      flush();
      expect(frames.at(-1)).toBe("row:0:0");
      expect(error).not.toHaveBeenCalled();
      dispose();
    });
  }
);
