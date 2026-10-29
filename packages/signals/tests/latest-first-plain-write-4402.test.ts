import { describe, expect, it } from "vitest";
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  latest
} from "../src/index.js";

async function tick() {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
}

describe("[latest(s), s()] in a flush that commits runs once", () => {
  function runsOnce(
    via: "inline" | "memo" | "latest(memo)",
    reader: "memo" | "render effect" | "user effect"
  ) {
    let set!: (v: number) => void;
    let passes = 0;
    const seen: string[] = [];
    const dispose = createRoot(d => {
      const [s, _set] = createSignal(0);
      set = _set;
      const m = createMemo(() => s());
      const L = createMemo(() => latest(s));
      const l = via === "memo" ? L : via === "latest(memo)" ? () => latest(m) : () => latest(s);
      const f = () => {
        passes++;
        const first = l();
        return `l:${first} v:${s()}`;
      };
      if (reader === "memo") createRenderEffect(createMemo(f), v => void seen.push(v));
      else
        (reader === "user effect" ? createEffect : createRenderEffect)(
          f,
          (v: string) => void seen.push(v)
        );
      return d;
    });
    flush();
    passes = 0;
    set(1);
    flush();
    set(2);
    flush();
    expect(seen).toEqual(["l:0 v:0", "l:1 v:1", "l:2 v:2"]);
    expect(passes).toBe(2);
    dispose();
  }

  for (const via of ["inline", "memo", "latest(memo)"] as const) {
    for (const reader of ["render effect", "user effect"] as const)
      it(`${via}, ${reader}`, () => runsOnce(via, reader));
    // A memo reader still computes twice (verdict-memo-flight-no-reask.test.ts).
    it.fails(`${via}, memo`, () => runsOnce(via, "memo"));
  }
});

describe("[latest(s), s()] in a flush that parks re-derives once on the screen", () => {
  function setup() {
    let resolveA: (() => void) | undefined;
    let set!: (v: number) => void;
    const out = { first: "", beside: "" };
    let passes = 0;
    const dispose = createRoot(d => {
      const [s, _set] = createSignal(0);
      set = _set;
      const A = createMemo(() => {
        const v = s();
        return v === 0 ? 0 : new Promise<number>(r => (resolveA = () => r(v)));
      });
      createRenderEffect(
        () => {
          passes++;
          const l = latest(s);
          return `l:${l} v:${s()}`;
        },
        v => void (out.first = v)
      );
      createRenderEffect(
        () => `v:${s()} a:${A()} l:${latest(s)}`,
        v => void (out.beside = v)
      );
      return d;
    });
    return {
      dispose,
      out,
      passes: () => passes,
      set: (v: number) => set(v),
      resolveA: () => resolveA!()
    };
  }

  it("the held write shows through latest() beside the screen, then the landing", async () => {
    const t = setup();
    flush();
    expect(t.out).toEqual({ first: "l:0 v:0", beside: "v:0 a:0 l:0" });
    const before = t.passes();
    t.set(1);
    flush();
    await tick();
    expect(t.out).toEqual({ first: "l:1 v:0", beside: "v:0 a:0 l:1" });
    expect(t.passes() - before).toBe(2);
    t.resolveA();
    await tick();
    expect(t.out).toEqual({ first: "l:1 v:1", beside: "v:1 a:1 l:1" });
    t.dispose();
  });
});
