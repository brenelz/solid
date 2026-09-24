/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFrameHost, installServerComponents } from "../frames/src/client.js";
import {
  COMPONENT_BINDING,
  SERVER_COMPONENT,
  SERVER_COMPONENT_ADDRESS,
  flightCodec
} from "../frames/src/frame-transport.js";
import { createJSONDataTable } from "../serialization/src/serializer.js";
import {
  SINGLE_FLIGHT_HEADER,
  createServerReference,
  subscribeFlightData
} from "../server-functions/src/client.js";
import {
  ChunkReader,
  REDIRECT_HEADER,
  createChunk,
  serializeStream
} from "../server-functions/src/shared.js";

function makeHost() {
  const table = createJSONDataTable();
  return createFrameHost({
    applyData: (c: any) => table.apply(c),
    resolve: (ref: any) => table.resolve(ref)
  });
}

function component(id: string) {
  const fn: any = () => null;
  fn[SERVER_COMPONENT] = id;
  fn[SERVER_COMPONENT_ADDRESS] = id;
  return fn;
}

async function flightResponse(
  sources: string,
  regions: string[],
  outcome: unknown,
  headers: Record<string, string> = {}
) {
  const chunks: any[] = [];
  for (const id of regions) {
    chunks.push(
      { type: "start", id, version: 1 },
      { type: "html", id, version: 1, html: `<p>${id}</p>` },
      { type: "complete", id, version: 1 }
    );
  }
  const reader = new ChunkReader(serializeStream(outcome, flightCodec()));
  for (let next = await reader.next(); !next.done; next = await reader.next()) {
    chunks.push({ type: "outcome", payload: next.value });
  }
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(createChunk(JSON.stringify(chunk)));
      controller.close();
    }
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-frame-stream",
      "X-Frame-Stream": "",
      "X-Content-Raw": "1",
      [SINGLE_FLIGHT_HEADER]: sources,
      ...headers
    }
  });
}

const save = createServerReference("notes/save");

describe("single-flight frame responses", () => {
  const subscriptions: (() => void)[] = [];
  beforeEach(() => installServerComponents(makeHost()));
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  });

  test("delivers the unnamed consumer its slice of the keyed envelope (#3638)", async () => {
    const delivered: any[] = [];
    subscriptions.push(subscribeFlightData(data => void delivered.push(data)));
    let requested: string | null = null;
    vi.stubGlobal("fetch", async (_base: any, init: any) => {
      requested = new Headers(init.headers).get(SINGLE_FLIGHT_HEADER);
      return flightResponse("true", ["view"], {
        value: "saved",
        data: { true: { "view[]": component("view") } }
      });
    });

    expect(await save()).toBe("saved");
    expect(requested).toBe("true");
    expect(delivered).toHaveLength(1);
    expect(Object.keys(delivered[0])).toEqual(["view[]"]);
    expect(delivered[0]["view[]"][COMPONENT_BINDING].address).toBe("view");
  });

  test("routes each folded source's slice to its own consumer", async () => {
    const delivered: Record<string, any> = {};
    subscriptions.push(subscribeFlightData(data => void (delivered.true = data)));
    subscriptions.push(subscribeFlightData("query", data => void (delivered.query = data)));
    vi.stubGlobal("fetch", async () =>
      flightResponse("true,query", ["q"], {
        value: "saved",
        data: { true: { "/notes": ["fresh"] }, query: { "q:1": component("q") } }
      })
    );

    expect(await save()).toBe("saved");
    expect(delivered.true).toEqual({ "/notes": ["fresh"] });
    expect(Object.keys(delivered.query)).toEqual(["q:1"]);
    expect(delivered.query["q:1"][COMPONENT_BINDING].address).toBe("q");
  });

  test("delivers a redirect to every registered consumer, folded or not", async () => {
    const calls: [string, unknown][] = [];
    subscriptions.push(subscribeFlightData(data => void calls.push(["true", data])));
    subscriptions.push(subscribeFlightData("query", data => void calls.push(["query", data])));
    vi.stubGlobal("fetch", async () =>
      flightResponse(
        "query",
        ["q"],
        { value: "saved", data: { query: { "q:1": component("q") } } },
        { [REDIRECT_HEADER]: "302 /notes" }
      )
    );

    expect(await save()).toBe("saved");
    expect(calls.map(([source]) => source)).toEqual(["true", "query"]);
    expect(calls[0][1]).toBeUndefined();
    expect(Object.keys(calls[1][1] as object)).toEqual(["q:1"]);
  });
});
