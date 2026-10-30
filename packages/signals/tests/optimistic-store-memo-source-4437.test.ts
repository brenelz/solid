/**
 * #4437: a derived `createOptimisticStore` over a memo follows the memo as a
 * `createStore(fn)` does — the memo's later rejection reaches the readers'
 * error handler instead of the store keeping its last value.
 */
import { describe, expect, it } from "vitest";
import {
  createEffect,
  createMemo,
  createOptimisticStore,
  createRoot,
  createSignal,
  createStore,
  flush,
  isPending
} from "../src/index.js";

type Row = { id: number };
type Ask = { key: string; res: (v: Row[]) => void; rej: (e: unknown) => void };
type Kind = "optimistic" | "store";
type Form = "await" | "memo-async" | "memo-sync";

const tick = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

function mount(kind: Kind, form: Form, read: (issues: Row[]) => string) {
  const asks: Ask[] = [];
  const ask = (key: string) => new Promise<Row[]>((res, rej) => asks.push({ key, res, rej }));
  const settle = async (key: string, f: (a: Ask) => void) => {
    for (const a of asks.filter(a => a.key === key)) {
      asks.splice(asks.indexOf(a), 1);
      f(a);
    }
    await tick();
  };
  const frames: string[] = [];
  let setFilter!: (f: string) => void;
  const dispose = createRoot(d => {
    const [filter, sf] = createSignal("open");
    setFilter = sf;
    const m = createMemo(() => ask(`f:${filter()}`));
    const make = kind === "store" ? createStore : createOptimisticStore;
    const write = (d: Row[], rows: Row[]) => {
      d.length = 0;
      d.push(...rows.map(x => ({ ...x })));
    };
    const [issues] = make<Row[]>(
      form === "memo-sync"
        ? (d: Row[]) => {
            write(d, m());
          }
        : async (d: Row[]) => {
            write(d, form === "memo-async" ? m() : await ask(`f:${filter()}`));
          },
      [],
      { key: "id" }
    );
    createEffect(() => read(issues), {
      effect: v => {
        frames.push(v);
      },
      error: e => {
        frames.push(`ERR ${(e as Error).message}`);
      }
    });
    return d;
  });
  return { frames, setFilter, settle, dispose };
}

for (const kind of ["optimistic", "store"] as const)
  describe(`#4437: a derived ${kind} over a failing memo`, () => {
    for (const form of ["await", "memo-async", "memo-sync"] as const)
      it(`reports the memo's rejection (${form})`, async () => {
        const h = mount(kind, form, issues => issues.map(i => `#${i.id}`).join(" "));
        await tick();
        await h.settle("f:open", a => a.res([{ id: 1 }, { id: 3 }]));
        expect(h.frames).toEqual(["#1 #3"]);
        h.setFilter("closed");
        flush();
        await tick();
        expect(h.frames).toEqual(["#1 #3"]);
        await h.settle("f:closed", a => a.rej(new Error("timeout")));
        expect(h.frames).toEqual(["#1 #3", "ERR timeout"]);
        h.dispose();
      });

    for (const form of ["memo-async", "memo-sync"] as const)
      it(`reports the memo pending again through isPending (${form})`, async () => {
        const h = mount(
          kind,
          form,
          issues => `${issues.length} ${isPending(() => issues.length) ? "pending" : "-"}`
        );
        await tick();
        await h.settle("f:open", a => a.res([{ id: 1 }, { id: 3 }]));
        expect(h.frames).toEqual(["2 -"]);
        h.setFilter("closed");
        flush();
        await tick();
        expect(h.frames).toEqual(["2 -", "2 pending"]);
        await h.settle("f:closed", a => a.res([{ id: 5 }]));
        expect(h.frames.at(-1)).toBe("1 -");
        expect(h.frames.slice(1, -1).every(f => f === "2 pending")).toBe(true);
        h.dispose();
      });
  });
