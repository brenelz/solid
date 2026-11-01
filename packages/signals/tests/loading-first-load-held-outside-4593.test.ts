import { expect, it } from "vitest";
import {
  createLoadingBoundary,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush
} from "../src/index.js";

const tick = async () => {
  for (let i = 0; i < 2; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

function setup(question: (s: () => number, flag: () => number) => string) {
  const flights = new Map<string, (v: number) => void>();
  const ask = (key: string) => new Promise<number>(resolve => flights.set(key, resolve));
  const [s, setS] = createSignal(0);
  const [flag, setFlag] = createSignal(0);
  let outside = "";
  let leaf = "";
  let output: string | undefined;
  const dispose = createRoot(dispose => {
    const a = createMemo(() => ask("a:" + s()));
    const b = createMemo(() => ask(question(s, flag)));
    createRenderEffect(
      () => `a=${a()}s=${s()}`,
      v => void (outside = v)
    );
    const boundary = createLoadingBoundary(
      () => {
        createRenderEffect(
          () => `b=${b()}`,
          v => void (leaf = v)
        );
        return "content";
      },
      () => "loading b"
    );
    createRenderEffect(boundary, v => void (output = v));
    return dispose;
  });
  const land = (key: string, v: number) => flights.get(key)!(v);
  const shown = () => outside + (output === "content" ? leaf : output);
  return { setS, setFlag, land, shown, dispose };
}

it("a first-load Loading does not reveal content derived from a write still held outside it (#4593)", async () => {
  const f = setup(s => "b:" + s());
  const frames: string[] = [];
  flush();
  await tick();
  f.land("a:0", 10);
  await tick();
  frames.push(f.shown());
  f.setS(1);
  flush();
  await tick();
  frames.push(f.shown());
  f.land("b:1", 21);
  await tick();
  frames.push(f.shown());
  f.land("a:1", 11);
  await tick();
  frames.push(f.shown());
  f.dispose();
  expect(frames).toEqual([
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=11s=1b=21"
  ]);
});

it("a first load re-asked over a netted staging of the held signal lands beside the committed value", async () => {
  const f = setup(s => "b:" + s());
  const frames: string[] = [];
  flush();
  await tick();
  f.land("a:0", 10);
  await tick();
  f.setS(1);
  flush();
  await tick();
  f.setS(0);
  flush();
  await tick();
  frames.push(f.shown());
  f.land("b:0", 20);
  await tick();
  frames.push(f.shown());
  f.land("a:0", 12);
  await tick();
  frames.push(f.shown());
  f.dispose();
  expect(frames).toEqual(["a=10s=0loading b", "a=10s=0b=20", "a=12s=0b=20"]);
});

it("a first load re-asked without reading the held signal lands on its own", async () => {
  const f = setup((s, flag) => (flag() ? "b:flag:" + flag() : "b:" + s()));
  const frames: string[] = [];
  flush();
  await tick();
  f.land("a:0", 10);
  await tick();
  f.setS(1);
  flush();
  await tick();
  f.setFlag(1);
  flush();
  await tick();
  frames.push(f.shown());
  f.land("b:flag:1", 30);
  await tick();
  frames.push(f.shown());
  f.land("a:1", 11);
  await tick();
  frames.push(f.shown());
  f.dispose();
  expect(frames).toEqual(["a=10s=0loading b", "a=10s=0b=30", "a=11s=1b=30"]);
});
