import { describe, expect, it } from "vitest";
import { createRenderEffect, createRoot, createSignal, createStore, flush } from "../src/index.js";

// #3767: a writable derived store that returns a row of its own draft. The
// draft wrapper forwards to the store's row proxy; the reconcile must adopt
// the row's backing, never the wrapper.
type Row = { id: string; name: string; failed?: boolean };

function setup() {
  const views: string[] = [];
  const h = createRoot(() => {
    const [source, setSource] = createSignal<Row[]>([{ id: "A", name: "a" }]);
    const [rows, setRows] = createStore<Row[]>(
      draft => [...source(), ...draft.filter(row => row.failed)],
      []
    );
    createRenderEffect(
      () => rows.map(row => `${row.id}:${row.name}${row.failed ? "!" : ""}`).join(","),
      v => void views.push(v)
    );
    return { rows, setRows, setSource };
  });
  flush();
  return { ...h, views };
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
});
