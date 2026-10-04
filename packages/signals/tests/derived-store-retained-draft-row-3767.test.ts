import { describe, expect, it } from "vitest";
import {
  createRenderEffect,
  createRoot,
  createSignal,
  createStore,
  deep,
  flush
} from "../src/index.js";
import { $TARGET, markRaw, STORE_VALUE } from "../src/store/store.js";

type Row = { id: string; name: string; failed?: boolean };

function setup(initial: Row[] = [{ id: "A", name: "a" }]) {
  const views: string[] = [];
  const kept: (Row | undefined)[] = [];
  const h = createRoot(() => {
    const [source, setSource] = createSignal<Row[]>(initial);
    const [rows, setRows] = createStore<Row[]>(
      draft => [...source(), ...draft.filter(row => row.failed)],
      []
    );
    createRenderEffect(
      () => rows.map(row => `${row.id}:${row.name}${row.failed ? "!" : ""}`).join(","),
      v => void views.push(v)
    );
    createRenderEffect(
      () => rows[1],
      v => void kept.push(v)
    );
    return { rows, setRows, setSource };
  });
  flush();
  return { ...h, views, kept };
}

function backing(store: any): any {
  return store[$TARGET][STORE_VALUE];
}

describe("#3767: a derived store retains a draft row across a source refresh", () => {
  it("the retained row stays readable after an equivalent source array", () => {
    const h = setup();
    expect(h.views.at(-1)).toBe("A:a");
    h.setRows(d => {
      d.push({ id: "L", name: "local", failed: true });
    });
    flush();
    expect(h.views.at(-1)).toBe("A:a,L:local!");
    h.setSource([{ id: "A", name: "a" }]);
    flush();
    expect(h.views.at(-1)).toBe("A:a,L:local!");
    expect(Object.keys(h.rows[1])).toEqual(["id", "name", "failed"]);
    expect(JSON.parse(JSON.stringify(h.rows))).toEqual([
      { id: "A", name: "a" },
      { id: "L", name: "local", failed: true }
    ]);
  });

  it("the stored slot is the row's proxy, so its subscriber ignores unrelated refreshes", () => {
    const h = setup();
    h.setRows(d => {
      d.push({ id: "L", name: "local", failed: true });
    });
    flush();
    h.setSource([{ id: "A", name: "a" }]);
    flush();
    expect(backing(h.rows)[1]).toBe(h.rows[1]);
    const runs = h.kept.length;
    const row = h.rows[1];
    h.setSource([{ id: "A", name: "a2" }]);
    flush();
    h.setSource([{ id: "A", name: "a3" }]);
    flush();
    expect(h.rows[1]).toBe(row);
    expect(h.kept.length).toBe(runs);
    expect(h.views.at(-1)).toBe("A:a3,L:local!");
  });

  it("the retained row keeps following later source changes and writes", () => {
    const h = setup();
    h.setRows(d => {
      d.push({ id: "L", name: "local", failed: true });
    });
    flush();
    h.setSource([{ id: "A", name: "a" }]);
    flush();
    h.setSource([{ id: "A", name: "a2" }]);
    flush();
    expect(h.views.at(-1)).toBe("A:a2,L:local!");
    h.setRows(d => {
      d[1].name = "local2";
    });
    flush();
    expect(h.views.at(-1)).toBe("A:a2,L:local2!");
    h.setRows(d => {
      d[1].failed = false;
    });
    h.setSource([{ id: "A", name: "a3" }]);
    flush();
    expect(h.views.at(-1)).toBe("A:a3");
  });

  it("markRaw'd and frozen rows keep their identity through the draft", () => {
    const raw = markRaw({ id: "R", name: "raw", failed: true }) as Row;
    const frozen = Object.freeze({ id: "F", name: "frozen", failed: true }) as Row;
    const h = setup([raw, frozen]);
    expect(h.rows[0]).toBe(raw);
    expect(h.rows[1]).toBe(frozen);
    h.setSource([]);
    flush();
    expect(h.views.at(-1)).toBe("R:raw!,F:frozen!");
    expect(h.rows[0]).toBe(raw);
    expect(h.rows[1]).toBe(frozen);
    expect(backing(h.rows)).toEqual([raw, frozen]);
  });

  it("a draft object assigned to another key resolves to the same proxy", () => {
    const h = createRoot(() => {
      const [pick, setPick] = createSignal<"a" | "b">("a");
      const [s, setS] = createStore<{ a: { v: number }; b: { v: number }; cur?: { v: number } }>(
        d => {
          d.cur = pick() === "a" ? d.a : d.b;
        },
        { a: { v: 1 }, b: { v: 2 } }
      );
      return { s, setS, setPick };
    });
    flush();
    expect(h.s.cur).toBe(h.s.a);
    h.setPick("b");
    flush();
    expect(h.s.cur).toBe(h.s.b);
    h.setS(d => {
      d.b.v = 5;
    });
    flush();
    expect(h.s.cur!.v).toBe(5);
  });

  it("a fresh container of draft objects written through the draft stores their proxies", () => {
    const h = createRoot(() => {
      const [s] = createStore<{ a: { v: number }; b: { v: number }; list?: { v: number }[] }>(
        d => {
          d.list = [d.a, d.b];
        },
        { a: { v: 1 }, b: { v: 2 } }
      );
      return { s };
    });
    flush();
    expect(h.s.list![0]).toBe(h.s.a);
    expect(backing(h.s).list[0]).toBe(h.s.a);
    expect(backing(h.s).list[1]).toBe(h.s.b);
  });

  it("a derive returning a nested draft object chains the root to that proxy", () => {
    const h = createRoot(() => {
      const [tick, setTick] = createSignal(0);
      const [s] = createStore<any>(
        d => {
          tick();
          if (d.box) return d.box;
        },
        { box: { v: 1 } }
      );
      const views: number[] = [];
      createRenderEffect(
        () => s.v as number,
        v => void views.push(v)
      );
      return { s, setTick, views };
    });
    flush();
    const root = backing(h.s);
    expect(root[$TARGET].px).toBe(root);
    h.setTick(1);
    flush();
    expect(backing(h.s)).toBe(root);
    expect(h.views).toEqual([1]);
  });

  it("deep() of a draft object inside the derive returns the plain view", () => {
    let seen: any;
    createRoot(() => {
      const [s] = createStore<{ box: { v: number } }>(
        d => {
          seen = deep(d.box);
        },
        { box: { v: 1 } }
      );
      s.box;
    });
    flush();
    expect(seen).toEqual({ v: 1 });
    expect(seen[$TARGET]).toBeUndefined();
  });
});
