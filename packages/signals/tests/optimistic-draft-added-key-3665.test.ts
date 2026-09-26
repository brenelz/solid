/**
 * #3665 — inside one action body, a key the first setter added to an
 * optimistic store (`push`, `d[1] = …`, `d.b = …`) reads as `undefined` in
 * the next setter's draft although that draft's `length` and `in` already
 * see it. The draft is the writer's channel and composes on the tick's own
 * writes; readers outside the draft see nothing until the flush (A28).
 */
import {
  action,
  createOptimisticStore,
  createRenderEffect,
  createRoot,
  flush,
  untrack
} from "../src/index.js";

afterEach(() => flush());

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

interface Row {
  id: string;
  selected?: boolean;
}

describe("#3665 a second setter's draft sees the key the first setter added", () => {
  it("array push, then findIndex and index read in the next setter", async () => {
    const gate = deferred();
    const [rows, setRows] = createOptimisticStore<Row[]>([{ id: "a" }]);
    const seen: Row[][] = [];
    createRoot(() => {
      createRenderEffect(
        () => rows.map(r => ({ ...r })),
        v => {
          seen.push(v);
        }
      );
    });
    flush();

    let index = -2;
    let second: Row | undefined;
    const add = action(function* () {
      setRows(d => {
        d.push({ id: "b" });
      });
      expect(untrack(() => rows.length)).toBe(1);
      expect(untrack(() => rows[1])).toBeUndefined();
      expect(untrack(() => 1 in rows)).toBe(false);
      setRows(d => {
        expect(d.length).toBe(2);
        expect(1 in d).toBe(true);
        second = d[1];
        index = d.findIndex(r => r?.id === "b");
        d[index].selected = true;
      });
      yield gate.promise;
    });
    const p = add();
    expect(second).toEqual({ id: "b" });
    expect(index).toBe(1);
    expect(seen).toEqual([[{ id: "a" }]]);

    flush();
    expect(seen).toEqual([[{ id: "a" }], [{ id: "a" }, { id: "b", selected: true }]]);
    gate.resolve();
    await p;
    flush();
    expect(seen.at(-1)).toEqual([{ id: "a" }]);
  });

  it("index set d[1], then read in the next setter", () => {
    const [, setRows] = createOptimisticStore<Row[]>([{ id: "a" }]);
    let second: Row | undefined;
    action(function* () {
      setRows(d => {
        d[1] = { id: "b" };
      });
      setRows(d => {
        second = d[1];
      });
      yield;
    })();
    expect(second).toEqual({ id: "b" });
  });

  it("object key add d.b, then read, keys and spread in the next setter", () => {
    const [rows, setRows] = createOptimisticStore<Record<string, Row>>({ a: { id: "a" } });
    let b: Row | undefined;
    let keys: string[] = [];
    let spread: Record<string, Row> = {};
    let desc: PropertyDescriptor | undefined;
    action(function* () {
      setRows(d => {
        d.b = { id: "b" };
      });
      expect(untrack(() => rows.b)).toBeUndefined();
      expect(untrack(() => Object.keys(rows))).toEqual(["a"]);
      setRows(d => {
        expect("b" in d).toBe(true);
        b = d.b;
        keys = Object.keys(d);
        spread = { ...d };
        desc = Object.getOwnPropertyDescriptor(d, "b");
      });
      yield;
    })();
    expect(b).toEqual({ id: "b" });
    expect(keys).toEqual(["a", "b"]);
    expect(spread).toEqual({ a: { id: "a" }, b: { id: "b" } });
    expect(desc).toMatchObject({ value: { id: "b" }, enumerable: true });
    expect(untrack(() => rows.b)).toBeUndefined();
    expect(untrack(() => Object.keys(rows))).toEqual(["a"]);
  });
});
