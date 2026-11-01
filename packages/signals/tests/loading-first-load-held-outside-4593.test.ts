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

it("a first-load Loading does not reveal content derived from a write still held outside it (#4593)", async () => {
  const flights = new Map<string, (v: number) => void>();
  const ask = (key: string) => new Promise<number>(resolve => flights.set(key, resolve));
  const [s, setS] = createSignal(0);
  let outside = "";
  let leaf = "";
  let output: string | undefined;
  const frames: string[] = [];
  const dispose = createRoot(dispose => {
    const a = createMemo(() => ask("a:" + s()));
    const b = createMemo(() => ask("b:" + s()));
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
  const shown = () => outside + (output === "content" ? leaf : output);
  flush();
  await tick();
  flights.get("a:0")!(10);
  await tick();
  frames.push(shown());
  setS(1);
  flush();
  await tick();
  frames.push(shown());
  flights.get("b:1")!(21);
  await tick();
  frames.push(shown());
  flights.get("a:1")!(11);
  await tick();
  frames.push(shown());
  dispose();
  expect(frames).toEqual([
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=11s=1b=21"
  ]);
});
