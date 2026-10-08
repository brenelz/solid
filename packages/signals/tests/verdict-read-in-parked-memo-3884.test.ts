import { describe, expect, it } from "vitest";
import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  createStore,
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

describe("a parked memo's plain reads beside the superseding write", () => {
  for (const kind of ["signal", "store", "untracked store"] as const) {
    it(`sees the staged ${kind}`, async () => {
      const log: string[] = [];
      const gate = gates();
      const [source, setSource] = createSignal("/");
      const [item, setItem] = createSignal("a");
      const [store, setStore] = createStore({ items: ["a"] });
      const readItem = () =>
        kind === "signal"
          ? item()
          : kind === "store"
            ? store.items[0]
            : untrack(() => store.items[0]);
      createRoot(() => {
        const data = createMemo(() => {
          const v = source();
          isPending(source);
          log.push(`data saw ${v} ${readItem()}`);
          return v.startsWith("/slow") ? gate(v).promise : v;
        });
        createRenderEffect(data, () => {});
      });
      flush();
      const checkpoint = (label: string) => log.push(`${label}: isPending=${isPending(source)}`);
      setSource("/slow1");
      flush();
      checkpoint("A parked");
      await tick();
      setSource("/slow2");
      setItem("b");
      setStore(s => {
        s.items[0] = "b";
      });
      flush();
      checkpoint("B flushed");
      await tick();
      gate("/slow1").resolve("one");
      await tick();
      checkpoint("A resolved");
      gate("/slow2").resolve("two");
      await tick();
      checkpoint("B resolved");
      expect(log).toEqual([
        "data saw / a",
        "data saw /slow1 a",
        "data saw /slow1 a",
        "A parked: isPending=true",
        "data saw /slow2 b",
        "B flushed: isPending=true",
        "A resolved: isPending=true",
        "data saw /slow2 b",
        "B resolved: isPending=false"
      ]);
    });
  }

  it("waits on an upstream async memo's newer flight instead of taking its committed value", async () => {
    const log: string[] = [];
    const gate = gates();
    const flight = (key: string) => {
      log.push(`flight ${key}`);
      return gate(key).promise;
    };
    const [source, setSource] = createSignal("/");
    createRoot(() => {
      const path = createMemo(() => {
        const v = source();
        return v.startsWith("/slow") ? flight(`path ${v}`).then(() => `P(${v})`) : v;
      });
      const data = createMemo(() => {
        const v = source();
        isPending(source);
        const p = path();
        log.push(`data saw path=${p} for ${v}`);
        return v.startsWith("/slow") ? flight(`data ${p}|${v}`) : v;
      });
      createRenderEffect(data, () => {});
    });
    flush();
    const checkpoint = (label: string) => log.push(`${label}: isPending=${isPending(source)}`);
    setSource("/slow1");
    flush();
    await tick();
    log.length = 0;
    setSource("/slow2");
    flush();
    checkpoint("B flushed");
    await tick();
    gate("path /slow1").resolve("one");
    await tick();
    checkpoint("path /slow1 resolved");
    gate("path /slow2").resolve("two");
    await tick();
    checkpoint("path /slow2 resolved");
    expect(log).toEqual([
      "flight path /slow2",
      "B flushed: isPending=true",
      "path /slow1 resolved: isPending=true",
      "data saw path=P(/slow2) for /slow2",
      "flight data P(/slow2)|/slow2",
      "path /slow2 resolved: isPending=true"
    ]);
  });
});

describe("A10 for verdict lane work the transaction does not hold", () => {
  it("joining through a born-held node keeps its plain reads on the screen", async () => {
    const log: string[] = [];
    const gate = gates();
    const [s, setS] = createSignal("/");
    const [x, setX] = createSignal(0);
    createRoot(() => {
      const data = createMemo(() => {
        const v = s();
        return v.startsWith("/slow") ? gate(v).promise : v;
      });
      createRenderEffect(data, () => {});
    });
    flush();
    setS("/slow1");
    flush();
    await tick();
    createRoot(() => {
      const born = createMemo(() => s());
      const v = createMemo(() => {
        const pending = isPending(x);
        born();
        return `[${pending},${x()}]`;
      });
      createRenderEffect(v, r => {
        log.push(`effect: ${r}`);
      });
    });
    setX(1);
    flush();
    await tick();
    expect(log).toEqual([]);
    gate("/slow1").resolve("one");
    await tick();
    expect(log).not.toContain("effect: [true,1]");
    expect(log[log.length - 1]).toBe("effect: [false,1]");
  });
});
