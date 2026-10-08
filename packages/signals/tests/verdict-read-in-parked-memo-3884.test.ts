import { describe, expect, it } from "vitest";
import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest,
  untrack
} from "../src/index.js";

const tick = () => new Promise(r => setTimeout(r, 0));

type Extra =
  | "nothing"
  | "untracked latest"
  | "untracked isPending"
  | "tracked latest"
  | "tracked isPending";

const extras: Extra[] = [
  "nothing",
  "untracked latest",
  "untracked isPending",
  "tracked latest",
  "tracked isPending"
];

function gates() {
  const map: Record<string, { promise: Promise<string>; resolve: (v: string) => void }> = {};
  return (key: string) => {
    if (!map[key]) {
      let resolve!: (v: string) => void;
      const promise = new Promise<string>(r => (resolve = r));
      map[key] = { promise, resolve };
    }
    return map[key];
  };
}

function readExtra(extra: Extra, source: () => string) {
  if (extra === "untracked latest") untrack(() => latest(source));
  if (extra === "untracked isPending") untrack(() => isPending(source));
  if (extra === "tracked latest") latest(source);
  if (extra === "tracked isPending") isPending(source);
}

async function run(extra: Extra, shape: "direct" | "chained") {
  const log: string[] = [];
  const gate = gates();
  const [source, setSource] = createSignal("/");

  createRoot(() => {
    const path = shape === "chained" ? createMemo(() => source()) : source;
    const data = createMemo(() => {
      const v = path();
      readExtra(extra, source);
      return v.startsWith("/slow") ? gate(v).promise : v;
    });
    createRenderEffect(data, () => {});
    const view = () => (isPending(source) ? latest(source) : "-");
    createRenderEffect(shape === "chained" ? createMemo(view) : view, v => {
      log.push(`effect: ${v}`);
    });
  });
  flush();
  const checkpoint = (label: string) => log.push(`${label}: isPending=${isPending(source)}`);

  setSource("/slow1");
  flush();
  checkpoint("A parked");
  await tick();
  setSource("/slow2");
  flush();
  checkpoint("B flushed");
  await tick();
  checkpoint("B flushed +tick");
  gate("/slow1").resolve("one");
  await tick();
  checkpoint("A resolved");
  gate("/slow2").resolve("two");
  await tick();
  checkpoint("B resolved");
  return log;
}

const expected = [
  "effect: -",
  "effect: /slow1",
  "A parked: isPending=true",
  "effect: /slow2",
  "B flushed: isPending=true",
  "B flushed +tick: isPending=true",
  "A resolved: isPending=true",
  "effect: -",
  "B resolved: isPending=false"
];

describe("verdict reads inside the parked memo of a superseded transition (#3884)", () => {
  for (const shape of ["direct", "chained"] as const) {
    for (const extra of extras) {
      it(`${shape}: parked memo also reads ${extra}`, async () => {
        expect(await run(extra, shape)).toEqual(expected);
      });
    }
  }
});
