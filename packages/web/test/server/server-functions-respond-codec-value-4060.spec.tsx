/**
 * `respond(value, init)` accepts every value a plain return accepts (#4060).
 *
 * The envelope used to build its passthrough JSON body eagerly, so a value
 * JSON cannot carry (a `bigint`) threw inside the function body and failed
 * the direct leg and the scripted HTTP leg, which never read that body: the
 * direct leg unwraps `value` and the scripted leg re-encodes it through the
 * same negotiation as a plain return. Only a caller without the client
 * runtime reads the body, so it is encoded when read.
 *
 * Runs against the built bundles (server-functions/dist/*, wired up in
 * vite.config.server.mjs).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequestEvent, respond } from "@solidjs/web";
import {
  GET as serverGET,
  createServerReference,
  decodeResponse,
  handleServerFunctionRequest,
  registerServerReference
} from "@solidjs/web/server-functions/server";

const RequestContext = Symbol.for("solid.RequestContext");
const requestContext = new AsyncLocalStorage<any>();

beforeAll(() => {
  (globalThis as any)[RequestContext] = requestContext;
});

afterAll(() => {
  delete (globalThis as any)[RequestContext];
});

const provideEvent = <T,>(_event: unknown, run: () => T): T => run();

function declareGET<F extends (...args: any[]) => any>(id: string, fn: F) {
  return serverGET(createServerReference(registerServerReference(id, fn))) as unknown as F;
}

function get(id: string, { scripted = true } = {}) {
  const address = scripted ? `/_server/data/${id}` : `/_server/${id}`;
  return handleServerFunctionRequest(new Request(`https://app.example${address}`), {
    provideEvent
  });
}

const cacheHeaders = { headers: { "Cache-Control": "public, s-maxage=60" } };

describe("respond() carries a value JSON cannot encode (#4060)", () => {
  it("constructs the envelope without encoding the value", () => {
    const envelope: any = respond({ n: 1n }, cacheHeaders);
    expect(envelope).toBeInstanceOf(Response);
    expect(envelope.value).toEqual({ n: 1n });
    expect(envelope.headers.get("cache-control")).toBe("public, s-maxage=60");
  });

  it("the direct leg resolves with the value", async () => {
    const getCount = declareGET("respond-4060-direct", async () =>
      respond({ n: 1n }, cacheHeaders)
    );
    const event = createRequestEvent(new Request("https://app.example/page"));
    expect(await requestContext.run(event, () => getCount())).toEqual({ n: 1n });
  });

  it("the scripted leg answers what a plain return answers, plus the metadata", async () => {
    declareGET("respond-4060-plain", async () => ({ n: 1n }));
    declareGET("respond-4060-scripted", async () => respond({ n: 1n }, cacheHeaders));

    const plain = await get("respond-4060-plain");
    expect(plain.status).toBe(200);
    expect(await decodeResponse(plain)).toEqual({ n: 1n });

    const wrapped = await get("respond-4060-scripted");
    expect(wrapped.status).toBe(200);
    expect(wrapped.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await decodeResponse(wrapped)).toEqual({ n: 1n });
  });

  it("a caller without the client runtime still reads a JSON body", async () => {
    declareGET("respond-4060-unscripted", async () => respond({ id: 7 }, cacheHeaders));
    const response = await get("respond-4060-unscripted", { scripted: false });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual({ id: 7 });
  });
});
