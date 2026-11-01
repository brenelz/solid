/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { render } from "../src/index.js";
import { createMemo, createSignal, Errored, flush, Loading } from "solid-js";
import { expect, it } from "vitest";

const tick = async () => {
  for (let i = 0; i < 2; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
};

it("a first-load <Loading> does not reveal content derived from a write still held outside it (#4593)", async () => {
  const flights = new Map<string, (v: number) => void>();
  const ask = (key: string) => new Promise<number>(resolve => flights.set(key, resolve));
  const [s, setS] = createSignal(0);
  const el = document.createElement("div");
  const frames: string[] = [];
  const dispose = render(() => {
    const a = createMemo(() => ask("a:" + s()));
    const b = createMemo(() => ask("b:" + s()));
    return (
      <Errored fallback={<p>error</p>}>
        <p>a={a()}</p>
        <p>s={s()}</p>
        <Loading fallback={<p>loading b</p>}>
          <p>b={b()}</p>
        </Loading>
      </Errored>
    );
  }, el);
  await tick();
  flights.get("a:0")!(10);
  await tick();
  frames.push(el.textContent!);
  setS(1);
  flush();
  await tick();
  frames.push(el.textContent!);
  flights.get("b:1")!(21);
  await tick();
  frames.push(el.textContent!);
  flights.get("a:1")!(11);
  await tick();
  frames.push(el.textContent!);
  dispose();
  expect(frames).toEqual([
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=10s=0loading b",
    "a=11s=1b=21"
  ]);
});
