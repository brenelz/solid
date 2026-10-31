import { describe, expect, it } from "vitest";
import {
  action,
  createLoadingBoundary,
  createOptimisticStore,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  refresh,
  untrack
} from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

function page(on: boolean) {
  const asks: { key: string; res: (v: any) => void }[] = [];
  const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
  const land = async (key: string, v: any) => {
    const i = asks.findIndex(a => a.key === key);
    if (i < 0) throw new Error(`not asked: ${key}; asked: ${asks.map(a => a.key)}`);
    asks.splice(i, 1)[0].res(v);
    await tick();
  };
  const frames: string[] = [];
  let setFilter!: (f: string) => void;
  let closeOne!: (id: number) => void;
  createRoot(() => {
    const [filter, sf] = createSignal("open");
    setFilter = sf;
    const [issues, set] = createOptimisticStore<any[]>(() => ask(`issues:${filter()}`), [], {
      key: "id"
    });
    closeOne = action(function* (id: number) {
      set(list => {
        const i = list.findIndex(t => t.id === id);
        if (i >= 0) list.splice(i, 1);
      });
      yield ask(`close:${id}`);
      refresh(issues);
    }) as any;
    let text = "";
    let shell = "";
    let queued = false;
    const sample = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const f = shell === "loading" ? shell : text;
        if (frames.at(-1) !== f) frames.push(f);
      });
    };
    const content = untrack(() =>
      createLoadingBoundary(
        () => {
          createRenderEffect(
            () => filter() + ": " + issues.map(i => `[#${i.id}]`).join(""),
            v => ((text = v), sample())
          );
          return () => "content";
        },
        () => "loading",
        on ? { on: () => filter() } : undefined
      )
    );
    createRenderEffect(
      () => {
        const v: any = content();
        return typeof v === "function" ? v() : v;
      },
      v => ((shell = v), sample())
    );
  });
  return { asks, land, frames, setFilter, closeOne: (id: number) => closeOne(id) };
}

describe("#4536 one render effect reads both the question and the keyed list", () => {
  for (const on of [false, true])
    it(`a guess under a new question never shows the new filter beside the old answer's rows (on=${on})`, async () => {
      const h = page(on);
      await tick();
      await h.land("issues:open", [{ id: 1 }, { id: 3 }, { id: 4 }]);
      expect(h.frames.at(-1)).toBe("open: [#1][#3][#4]");
      h.setFilter("closed");
      await tick();
      expect(h.frames.at(-1)).toBe(on ? "loading" : "open: [#1][#3][#4]");
      h.closeOne(1);
      await tick();
      expect(h.frames.at(-1)).toBe(on ? "loading" : "open: [#3][#4]");
      await h.land("issues:closed", [{ id: 1 }, { id: 2 }]);
      expect(h.frames.at(-1)).toBe("closed: [#2]");
      await h.land("close:1", {});
      expect(h.frames.at(-1)).toBe("closed: [#2]");
      await h.land("issues:closed", [{ id: 2 }]);
      expect(h.frames.at(-1)).toBe("closed: [#2]");
      expect(h.asks).toEqual([]);
      expect(h.frames.filter(f => f.startsWith("closed") && /#3|#4/.test(f))).toEqual([]);
    });
});
