import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ERROR_HEADER,
  SINGLE_FLIGHT_HEADER,
  handleServerFunctionRequest,
  registerFlightDataSource,
  registerServerFunction
} from "@solidjs/web/server-functions/server";
import { ChunkReader, createChunk, deserializeStream } from "@solidjs/web/server-functions/client";
import {
  ServerComponentPlugin,
  frameTransformDirectResult,
  frameTransformFlightResult
} from "@solidjs/web/frames/server";

const RequestContext = Symbol.for("solid.RequestContext");

beforeAll(() => {
  (globalThis as any)[RequestContext] = new AsyncLocalStorage();
  (globalThis as any)._$SC = { r: (id: string) => `component:${id}` };
});

afterAll(() => {
  delete (globalThis as any)[RequestContext];
  delete (globalThis as any)._$SC;
});

function cachedComponent(id: string, markup: string) {
  return frameTransformDirectResult(() => markup, { id, args: [] });
}

function flightRequest(id: string, sources: string) {
  return new Request(`https://app.example/_server/data/${id}`, {
    method: "POST",
    body: "[]",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "X-Server-Function-Format": "8",
      [SINGLE_FLIGHT_HEADER]: sources
    }
  });
}

async function readChunks(response: Response) {
  const chunks: any[] = [];
  const reader = new ChunkReader(response.body!);
  for (let next = await reader.next(); !next.done; next = await reader.next()) {
    chunks.push(JSON.parse(next.value));
  }
  return chunks;
}

function decodeOutcome(chunks: any[]) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        if (chunk.type === "outcome") controller.enqueue(createChunk(chunk.payload));
      }
      controller.close();
    }
  });
  return deserializeStream(new Response(body), { plugins: [ServerComponentPlugin] });
}

describe("single-flight regions through the frames sink", () => {
  it("frames a component the unnamed collector folded into its keyed slice (#3638)", async () => {
    registerServerFunction("flight-regions-unnamed", async () => "saved");

    const response = await handleServerFunctionRequest(
      flightRequest("flight-regions-unnamed", "true"),
      {
        collectFlightData: () => ({ "view[]": cachedComponent("view", "fresh markup") }),
        transformFlightResult: frameTransformFlightResult
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-frame-stream");
    expect(response.headers.get(SINGLE_FLIGHT_HEADER)).toBe("true");
    const chunks = await readChunks(response);
    const regions = chunks.filter(chunk => chunk.type === "html");
    expect(regions.map(chunk => chunk.id)).toEqual(["view"]);
    expect(regions[0].html).toContain("fresh markup");
    expect(await decodeOutcome(chunks)).toEqual({
      value: "saved",
      data: { true: { "view[]": "component:view" } }
    });
  });

  it("keeps every source's slice and names the folded sources on the response", async () => {
    registerServerFunction("flight-regions-named", async () => "saved");
    const unregister = registerFlightDataSource("query", () => ({
      "q:1": cachedComponent("query-view", "query markup")
    }));
    try {
      const response = await handleServerFunctionRequest(
        flightRequest("flight-regions-named", "true,query"),
        {
          collectFlightData: () => ({ "/notes": ["fresh"] }),
          transformFlightResult: frameTransformFlightResult
        }
      );

      expect(response.headers.get("Content-Type")).toBe("application/x-frame-stream");
      expect(response.headers.get(SINGLE_FLIGHT_HEADER)).toBe("true,query");
      const chunks = await readChunks(response);
      const regions = chunks.filter(chunk => chunk.type === "html");
      expect(regions.map(chunk => chunk.id)).toEqual(["query-view"]);
      expect(regions[0].html).toContain("query markup");
      expect(await decodeOutcome(chunks)).toEqual({
        value: "saved",
        data: {
          true: { "/notes": ["fresh"] },
          query: { "q:1": "component:query-view" }
        }
      });
    } finally {
      unregister();
    }
  });

  it("keeps a rejected entry for the codec instead of failing the mutation", async () => {
    registerServerFunction("flight-regions-rejected", async () => "saved");
    const unregister = registerFlightDataSource("query", () => ({
      "q:1": cachedComponent("query-rejected", "query markup")
    }));
    const failing = Promise.reject(new Error("db down"));
    failing.catch(() => {});
    try {
      const response = await handleServerFunctionRequest(
        flightRequest("flight-regions-rejected", "true,query"),
        {
          collectFlightData: () => ({ "/notes": failing }),
          transformFlightResult: frameTransformFlightResult
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers.has(ERROR_HEADER)).toBe(false);
      expect(response.headers.get("Content-Type")).toBe("application/x-frame-stream");
      const chunks = await readChunks(response);
      expect(chunks.filter(chunk => chunk.type === "html").map(chunk => chunk.id)).toEqual([
        "query-rejected"
      ]);
      const decoded: any = await decodeOutcome(chunks);
      expect(decoded.value).toBe("saved");
      expect(decoded.data.query).toEqual({ "q:1": "component:query-rejected" });
      await expect(decoded.data.true["/notes"]).rejects.toBeInstanceOf(Error);
    } finally {
      unregister();
    }
  });

  it("passes a slice that is not a plain object through unchanged", async () => {
    registerServerFunction("flight-regions-map", async () => "saved");
    const unregister = registerFlightDataSource("query", () => ({
      "q:1": cachedComponent("query-map", "query markup")
    }));
    try {
      const response = await handleServerFunctionRequest(
        flightRequest("flight-regions-map", "true,query"),
        {
          collectFlightData: () => new Map([["/notes", ["fresh"]]]),
          transformFlightResult: frameTransformFlightResult
        }
      );

      expect(response.headers.get(SINGLE_FLIGHT_HEADER)).toBe("true,query");
      const decoded: any = await decodeOutcome(await readChunks(response));
      expect(decoded.data.true).toEqual(new Map([["/notes", ["fresh"]]]));
      expect(decoded.data.query).toEqual({ "q:1": "component:query-map" });
    } finally {
      unregister();
    }
  });

  it("settles every source's entries at once", async () => {
    const subscribed: string[] = [];
    let release!: (value: unknown) => void;
    const held = {
      then(resolve: (value: unknown) => void) {
        subscribed.push("a");
        release = resolve;
      }
    };
    const ready = {
      then(resolve: (value: unknown) => void) {
        subscribed.push("b");
        resolve("b");
      }
    };
    const transformed = frameTransformFlightResult(undefined, {
      value: "saved",
      data: { a: { "a:1": held }, b: { "b:1": ready } }
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(subscribed).toEqual(["a", "b"]);
    release("a");
    expect(await transformed).toBeUndefined();
  });

  it("declines a keyed envelope with nothing to frame", async () => {
    const transformed = await frameTransformFlightResult(undefined, {
      value: "saved",
      data: { true: { "/notes": ["fresh"] } }
    });
    expect(transformed).toBeUndefined();
  });
});
