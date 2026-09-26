import {
  action,
  createOptimisticStore,
  createRenderEffect,
  createRoot,
  flush,
  untrack
} from "../src/index.js";
import { $TARGET } from "../src/store/store.js";

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

  it("index set d[1], then read and descriptors in the next setter", async () => {
    const gate = deferred();
    const [rows, setRows] = createOptimisticStore<Row[]>([{ id: "a" }]);
    let second: Row | undefined;
    let lengthDesc: PropertyDescriptor | undefined;
    let indexDesc: PropertyDescriptor | undefined;
    const p = action(function* () {
      setRows(d => {
        d[1] = { id: "b" };
      });
      setRows(d => {
        second = d[1];
        lengthDesc = Object.getOwnPropertyDescriptor(d, "length");
        indexDesc = Object.getOwnPropertyDescriptor(d, 1);
      });
      yield gate.promise;
    })();
    expect(second).toEqual({ id: "b" });
    expect(lengthDesc?.value).toBe(2);
    expect(indexDesc).toMatchObject({ value: { id: "b" }, enumerable: true });
    expect(untrack(() => rows.length)).toBe(1);

    flush();
    expect(untrack(() => rows.length)).toBe(2);
    gate.resolve();
    await p;
    flush();
    expect(untrack(() => rows.length)).toBe(1);
    expect(untrack(() => rows[1])).toBeUndefined();
  });

  it("object key add d.b and replace d.a, then read, keys, spread and descriptors in the next setter", async () => {
    const gate = deferred();
    const [rows, setRows] = createOptimisticStore<Record<string, Row>>({ a: { id: "a" } });
    let b: Row | undefined;
    let keys: string[] = [];
    let spread: Record<string, Row> = {};
    let descA: PropertyDescriptor | undefined;
    let descB: PropertyDescriptor | undefined;
    let rawB: unknown;
    const p = action(function* () {
      setRows(d => {
        d.b = { id: "b" };
        d.a = { id: "z" };
      });
      expect(untrack(() => rows.b)).toBeUndefined();
      expect(untrack(() => rows.a)).toEqual({ id: "a" });
      expect(untrack(() => Object.keys(rows))).toEqual(["a"]);
      setRows(d => {
        expect("b" in d).toBe(true);
        b = d.b;
        rawB = (d.b as any)[$TARGET].v;
        keys = Object.keys(d);
        spread = { ...d };
        descA = Object.getOwnPropertyDescriptor(d, "a");
        descB = Object.getOwnPropertyDescriptor(d, "b");
      });
      yield gate.promise;
    })();
    expect(b).toEqual({ id: "b" });
    expect(keys).toEqual(["a", "b"]);
    expect(spread).toEqual({ a: { id: "z" }, b: { id: "b" } });
    expect(descA?.value).toEqual({ id: "z" });
    expect(descB).toMatchObject({ value: { id: "b" }, enumerable: true });
    expect(descB?.value).toBe(rawB);
    expect(untrack(() => rows.b)).toBeUndefined();
    expect(untrack(() => Object.keys(rows))).toEqual(["a"]);

    flush();
    expect(untrack(() => rows.b)).toEqual({ id: "b" });
    expect(untrack(() => rows.a)).toEqual({ id: "z" });
    gate.resolve();
    await p;
    flush();
    expect(untrack(() => rows.b)).toBeUndefined();
    expect(untrack(() => rows.a)).toEqual({ id: "a" });
    expect(untrack(() => Object.keys(rows))).toEqual(["a"]);
  });
});
