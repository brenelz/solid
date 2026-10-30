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
  flush
} from "../src/index.js";

type Row = { id: number };
type Ask = { key: string; res: (v: Row[]) => void; rej: (e: unknown) => void };

const tick = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

for (const kind of ["optimistic", "store"] as const)
  describe(`#4437: a derived ${kind} over a failing memo`, () => {
    for (const form of ["await", "memo-async", "memo-sync"] as const)
      it(`reports the memo's rejection (${form})`, async () => {
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
          createEffect(() => issues.map(i => `#${i.id}`).join(" "), {
            effect: v => {
              frames.push(v);
            },
            error: e => {
              frames.push(`ERR ${(e as Error).message}`);
            }
          });
          return d;
        });
        await tick();
        await settle("f:open", a => a.res([{ id: 1 }, { id: 3 }]));
        expect(frames).toEqual(["#1 #3"]);
        setFilter("closed");
        flush();
        await tick();
        expect(frames).toEqual(["#1 #3"]);
        await settle("f:closed", a => a.rej(new Error("timeout")));
        expect(frames).toEqual(["#1 #3", "ERR timeout"]);
        dispose();
      });
  });
