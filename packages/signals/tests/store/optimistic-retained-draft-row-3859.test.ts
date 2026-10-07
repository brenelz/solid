import { describe, expect, it } from "vitest";
import {
  action,
  createOptimisticStore,
  createRenderEffect,
  createRoot,
  createSignal,
  createStore,
  deep,
  flush,
  snapshot
} from "../../src/index.js";

const tick = () => new Promise<void>(r => setTimeout(r, 0));
async function drain(n = 3) {
  for (let i = 0; i < n; i++) {
    await tick();
    flush();
  }
}

type Row = { id: string; value: number };
type Setter = (fn: (draft: Row[]) => Row[] | void) => void;

function setup(over: (local: Row[]) => [Row[], Setter]) {
  const shown: (number | undefined)[] = [];
  const deepShown: (number | undefined)[] = [];
  let setSource!: (rows: Row[]) => void;
  let setLocal!: Setter;
  let view!: Row[];
  let save!: () => Promise<void>;
  let complete!: () => void;
  const dispose = createRoot(d => {
    const [source, setSrc] = createSignal<Row[]>([{ id: "remote", value: 0 }]);
    setSource = setSrc;
    const [local, setL] = createStore<Row[]>(
      draft => [...source(), ...draft.filter(row => row.id === "local")],
      []
    );
    setLocal = setL;
    const [v, setView] = over(local);
    view = v;
    createRenderEffect(
      () => v.find(row => row.id === "local")?.value,
      value => {
        shown.push(value);
      }
    );
    createRenderEffect(
      () => deep(v).find(row => row.id === "local")?.value,
      value => {
        deepShown.push(value);
      }
    );
    save = action(function* () {
      setView(draft => {
        draft.find(row => row.id === "local")!.value = 1;
      });
      yield new Promise<void>(r => (complete = r));
    });
    return d;
  });
  flush();
  setLocal(draft => {
    draft.push({ id: "local", value: 0 });
  });
  flush();
  setSource([{ id: "remote", value: 0 }]);
  flush();
  expect(shown).toEqual([undefined, 0]);
  expect(deepShown.at(-1)).toBe(0);
  expect(view.map(row => row.id)).toEqual(["remote", "local"]);
  return { shown, deepShown, view, save, complete: () => complete(), dispose };
}

describe("optimistic store over a row a derive retains from its draft (#3859)", () => {
  it("shows the guess on the retained row while pending and reverts after", async () => {
    const s = setup(local => createOptimisticStore(local));
    const row = s.view[1];

    const p = s.save();
    await drain();
    expect(s.view[1]).toBe(row);
    expect(row.value).toBe(1);
    expect(s.shown).toEqual([undefined, 0, 1]);
    expect(s.deepShown.at(-1)).toBe(1);
    expect(snapshot(s.view)[1]).toEqual({ id: "local", value: 1 });

    s.complete();
    await p;
    await drain();
    expect(row.value).toBe(0);
    expect(s.shown.at(-1)).toBe(0);
    expect(s.deepShown.at(-1)).toBe(0);
    expect(snapshot(s.view)[1]).toEqual({ id: "local", value: 0 });
    s.dispose();
  });

  it("does the same through a shallow derived optimistic store", async () => {
    const s = setup(local => createOptimisticStore(draft => draft, local, { shallow: true }));
    const row = s.view[1];

    const p = s.save();
    await drain();
    expect(s.view[1]).toBe(row);
    expect(row.value).toBe(1);
    expect(s.shown).toEqual([undefined, 0, 1]);
    expect(snapshot(s.view)[1]).toEqual({ id: "local", value: 1 });

    s.complete();
    await p;
    await drain();
    expect(row.value).toBe(0);
    expect(s.shown.at(-1)).toBe(0);
    s.dispose();
  });
});
