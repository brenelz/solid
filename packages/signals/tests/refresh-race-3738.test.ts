import { expect, test } from "vitest";
import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  refresh
} from "../src/index.js";

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

test("refresh() landing beside an unrelated async write carries the write's hold", async () => {
  const errors: unknown[] = [];
  const onError = (e: any) => errors.push(e?.reason ?? e);
  process.on("unhandledRejection", onError);
  process.on("uncaughtException", onError);
  let dispose: (() => void) | undefined;
  try {
    const aFlights: ReturnType<typeof deferred<number>>[] = [];
    const bFlights: ReturnType<typeof deferred<number>>[] = [];
    let a!: () => number;
    let b!: () => number;
    let setX!: (v: number) => void;
    createRoot(d => {
      dispose = d;
      let run = 0;
      a = createMemo(() => {
        const n = run++;
        const flight = deferred<number>();
        aFlights.push(flight);
        return flight.promise.then(() => n);
      });
      createRenderEffect(a, () => {});
      const [x, sx] = createSignal(0);
      setX = sx;
      b = createMemo(() => {
        const v = x();
        const flight = deferred<number>();
        bFlights.push(flight);
        return flight.promise.then(() => v);
      });
      createRenderEffect(b, () => {});
    });
    flush();
    aFlights[0].resolve(0);
    bFlights[0].resolve(0);
    await tick();
    expect(a()).toBe(0);
    expect(b()).toBe(0);

    const refreshed = refresh(a);
    await tick();
    setX(1);
    flush();
    expect(aFlights.length).toBe(2);
    expect(bFlights.length).toBe(2);

    aFlights[1].resolve(1);
    await expect(refreshed).resolves.toBe(1);
    bFlights[1].resolve(1);
    await tick();
    expect(a()).toBe(1);
    expect(b()).toBe(1);
    expect(errors).toHaveLength(0);

    const refreshedAgain = refresh(a);
    await tick();
    aFlights[2].resolve(2);
    await expect(refreshedAgain).resolves.toBe(2);
    expect(a()).toBe(2);
    expect(errors).toHaveLength(0);
  } finally {
    dispose?.();
    process.removeListener("unhandledRejection", onError);
    process.removeListener("uncaughtException", onError);
  }
});
