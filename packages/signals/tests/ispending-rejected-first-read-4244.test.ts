// #4244: a memo whose first pass rejected has no value yet. Re-asked, a
// verdict reader sees it loading (NotReady), not pending with `undefined`.
import { expect, it } from "vitest";
import {
  createDeferred,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest
} from "../src/index.js";

const tick = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  flush();
};

function setup(create: typeof createMemo) {
  let setN!: (v: number) => void;
  let resolve!: (v: { key: string }) => void;
  let m!: () => { key: string };
  createRoot(() => {
    const [n, set] = createSignal(0);
    setN = set;
    m = create(() =>
      n() === 0
        ? Promise.reject(new Error("boom"))
        : new Promise<{ key: string }>(r => {
            resolve = r;
          })
    );
  });
  return { setN, resolve: (v: { key: string }) => resolve(v), m };
}

for (const [name, create] of [
  ["createMemo", createMemo],
  ["createDeferred", createDeferred]
] as const) {
  it(`isPending beside the read throws NotReady while a rejected ${name} is re-asked (#4244)`, async () => {
    const { setN, resolve, m } = setup(create);
    const seen: unknown[] = [];
    createRoot(() => {
      createRenderEffect(
        () => {
          try {
            return [isPending(() => m()), m()];
          } catch (e) {
            return [e];
          }
        },
        v => {
          seen.push(v);
        }
      );
    });
    flush();
    await tick();
    expect(seen[seen.length - 1]).toHaveLength(1);
    expect(((seen[seen.length - 1] as any[])[0] as Error).message).toBe("boom");

    seen.length = 0;
    setN(1);
    flush();
    for (const v of seen) {
      expect(v).toHaveLength(1);
      expect((v as any[])[0]).toBeInstanceOf(Error);
      expect(((v as any[])[0] as Error).message).not.toBe("boom");
    }

    resolve({ key: "a" });
    await tick();
    expect(seen[seen.length - 1]).toEqual([false, { key: "a" }]);
  });

  it(`latest() of a re-asked rejected ${name} throws NotReady, not undefined (#4244)`, async () => {
    const { setN, resolve, m } = setup(create);
    const seen: unknown[] = [];
    createRoot(() => {
      createRenderEffect(
        () => {
          try {
            return latest(() => m());
          } catch (e) {
            return e;
          }
        },
        v => {
          seen.push(v);
        }
      );
    });
    flush();
    await tick();
    expect((seen[seen.length - 1] as Error).message).toBe("boom");

    seen.length = 0;
    setN(1);
    flush();
    for (const v of seen) {
      expect(v).toBeInstanceOf(Error);
      expect((v as Error).message).not.toBe("boom");
    }

    resolve({ key: "a" });
    await tick();
    expect(seen[seen.length - 1]).toEqual({ key: "a" });
  });
}
