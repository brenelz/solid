/** @vitest-environment node */
import { describe, expect, test } from "vitest";
import { Serializer, getCrossReferenceHeader, Feature } from "seroval";

const ES2017FLAG = Feature.AggregateError | Feature.BigIntTypedArray;
const GLOBAL_IDENTIFIER = "_$HY.r";

function createTestSerializer() {
  const chunks: string[] = [];
  let doneCalled = false;

  const serializer = new Serializer({
    scopeId: undefined,
    plugins: [],
    globalIdentifier: GLOBAL_IDENTIFIER,
    disabledFeatures: ES2017FLAG,
    onData(data: string) {
      chunks.push(data);
    },
    onDone() {
      doneCalled = true;
    },
    onError(err: any) {
      throw err;
    }
  });

  function evalAllChunks(): Record<string, any> {
    const store: Record<string, any> = {};
    const _$HY = { r: store };
    // seroval output uses `self.$R` (browser global) and `_$HY.r["key"]`.
    // In Node.js, `self` doesn't exist, so we alias it to globalThis.
    const g = globalThis as any;
    const savedSelf = g.self;
    const savedR = g.$R;
    const savedHY = g._$HY;
    try {
      g.self = g;
      g._$HY = _$HY;
      const header = getCrossReferenceHeader(undefined);
      const script = header + ";" + chunks.join(";");
      (0, eval)(script);
      return store;
    } finally {
      if (savedSelf !== undefined) g.self = savedSelf;
      else delete g.self;
      if (savedR !== undefined) g.$R = savedR;
      else delete g.$R;
      if (savedHY !== undefined) g._$HY = savedHY;
      else delete g._$HY;
    }
  }

  return { serializer, chunks, evalAllChunks, isDone: () => doneCalled };
}

describe("Seroval Smoke Test — Promise serialization", () => {
  test("serializes and deserializes a resolved Promise", async () => {
    const { serializer, chunks, evalAllChunks, isDone } = createTestSerializer();

    const p = Promise.resolve(42);
    serializer.write("test", p);
    serializer.flush();

    expect(chunks.length).toBeGreaterThanOrEqual(1);

    // Wait for promise resolution
    await p;
    await new Promise<void>(r => queueMicrotask(r));

    expect(isDone()).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const store = evalAllChunks();
    expect(store["test"]).toBeInstanceOf(Promise);

    const value = await store["test"];
    expect(value).toBe(42);
  });
});

describe("Seroval Smoke Test — AsyncIterable detection", () => {
  test("Serializer.write handles an async generator", async () => {
    const { serializer, chunks } = createTestSerializer();

    async function* gen() {
      yield 1;
      yield 2;
      yield 3;
    }

    // Wrap in object since crossSerializeStream handles Symbol.asyncIterator on objects
    const iterable = gen();
    serializer.write("ai", iterable);
    serializer.flush();

    // Wait for all yields to be processed
    await new Promise<void>(r => setTimeout(r, 50));

    // Should have produced serialization chunks
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Stream values arrive as separate onData events", async () => {
    const { serializer, chunks } = createTestSerializer();

    let resolvers: Array<(v: void) => void> = [];
    async function* controlledGen() {
      yield "first";
      await new Promise<void>(r => resolvers.push(r));
      yield "second";
      await new Promise<void>(r => resolvers.push(r));
      yield "third";
    }

    serializer.write("stream", controlledGen());
    serializer.flush();

    // Wait for first yield
    await new Promise<void>(r => queueMicrotask(r));
    await new Promise<void>(r => queueMicrotask(r));
    const afterFirst = chunks.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Resolve second yield
    resolvers[0]?.();
    await new Promise<void>(r => setTimeout(r, 10));
    const afterSecond = chunks.length;
    expect(afterSecond).toBeGreaterThan(afterFirst);

    // Resolve third yield
    resolvers[1]?.();
    await new Promise<void>(r => setTimeout(r, 10));
    const afterThird = chunks.length;
    expect(afterThird).toBeGreaterThan(afterSecond);
  });

  test("client-side async iterable has buffered .next() behavior", async () => {
    const { serializer, chunks, evalAllChunks, isDone } = createTestSerializer();

    async function* gen() {
      yield "a";
      yield "b";
      yield "c";
    }

    serializer.write("buf", gen());
    serializer.flush();

    // Wait for all yields to complete
    await new Promise<void>(r => setTimeout(r, 100));
    expect(isDone()).toBe(true);

    // Eval all chunks on "client"
    const store = evalAllChunks();
    const value = store["buf"];

    // The deserialized value should have Symbol.asyncIterator
    expect(typeof value?.[Symbol.asyncIterator]).toBe("function");

    // Create iterator
    const iter = value[Symbol.asyncIterator]();

    // All values are buffered — .next() returns Promises but they should resolve immediately
    const r1 = await iter.next();
    expect(r1).toEqual({ done: false, value: "a" });

    const r2 = await iter.next();
    expect(r2).toEqual({ done: false, value: "b" });

    const r3 = await iter.next();
    expect(r3).toEqual({ done: false, value: "c" });

    const r4 = await iter.next();
    expect(r4).toEqual({ done: true, value: undefined });
  });

  test("KEY FINDING: .next() returns plain object (not Promise) for buffered values", async () => {
    const { serializer, chunks, evalAllChunks } = createTestSerializer();

    async function* gen() {
      yield 42;
    }

    serializer.write("sync-check", gen());
    serializer.flush();

    await new Promise<void>(r => setTimeout(r, 100));

    const store = evalAllChunks();
    const iter = store["sync-check"][Symbol.asyncIterator]();

    // For buffered values, .next() returns a plain IteratorResult (synchronously!)
    // This validates the hydration sequencing model: first value is available sync.
    const result = iter.next();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ done: false, value: 42 });

    // After buffer exhausted (done), also returns plain object
    const done = iter.next();
    expect(done).not.toBeInstanceOf(Promise);
    expect(done).toEqual({ done: true, value: undefined });
  });
});
