/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { expect, test } from "vitest";
import { Loading, action, createOptimisticStore, createSignal, flush, refresh } from "solid-js";
import { render } from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

for (const on of [true, false])
  test(`#4536: a guess under a new question in one text binding never pairs the new filter with the old rows (on=${on})`, async () => {
    const asks: { key: string; res: (v: any) => void }[] = [];
    const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
    const settle = async (key: string, v: any) => {
      const i = asks.findIndex(a => a.key === key);
      if (i < 0) throw new Error(`not asked: ${key}; asked: ${asks.map(a => a.key)}`);
      asks.splice(i, 1)[0].res(v);
      await tick();
    };
    const container = document.body.appendChild(document.createElement("div"));
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(container.textContent!));
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    let setFilter!: (f: string) => void;
    let closeOne!: (id: number) => any;
    const dispose = render(() => {
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
      });
      const body = () => <p>{filter() + ": " + issues.map(i => `[#${i.id}]`).join("")}</p>;
      return on ? (
        <Loading on={filter()} fallback={<p>loading</p>}>
          {body()}
        </Loading>
      ) : (
        <Loading fallback={<p>loading</p>}>{body()}</Loading>
      );
    }, container);
    try {
      await tick();
      await settle("issues:open", [{ id: 1 }, { id: 3 }, { id: 4 }]);
      expect(container.textContent).toBe("open: [#1][#3][#4]");
      setFilter("closed");
      await tick();
      expect(container.textContent).toBe(on ? "loading" : "open: [#1][#3][#4]");
      closeOne(1);
      await tick();
      expect(container.textContent).toBe(on ? "loading" : "open: [#3][#4]");
      await settle("issues:closed", [{ id: 1 }, { id: 2 }]);
      expect(container.textContent).toBe("closed: [#2]");
      await settle("close:1", {});
      expect(container.textContent).toBe("closed: [#2]");
      await settle("issues:closed", [{ id: 2 }]);
      expect(container.textContent).toBe("closed: [#2]");
      expect(asks).toEqual([]);
      expect(seen.filter(s => s.startsWith("closed") && /#3|#4/.test(s))).toEqual([]);
    } finally {
      observer.disconnect();
      dispose();
      container.remove();
    }
  });
