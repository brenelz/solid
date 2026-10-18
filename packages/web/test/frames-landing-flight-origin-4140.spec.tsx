/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// #4140: a consumer that mounts after an upstream wait, over a frame response
// already streaming, reads the landing as new work and ASYNC_WATERFALL calls
// the two sequential. The landing promise carries the call's start instead.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMemo, createRoot, createSignal, flush, Loading, OBSERVE, Show } from "solid-js";
import type { DiagnosticEvent } from "solid-js";
import { attribution } from "solid-js/attribution";
import { dynamic } from "../src/index.js";
import { installServerComponents, createFrameHost } from "../frames/src/client.js";
import { createJSONDataTable } from "../serialization/src/serializer.js";
import { createServerReference } from "../server-functions/src/client.js";
import { createChunk } from "../server-functions/src/shared.js";

const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));
const getPanel = createServerReference("panel/get");

function makeHost() {
  const table = createJSONDataTable();
  return createFrameHost({
    applyData: (c: any) => table.apply(c),
    resolve: (ref: any) => table.resolve(ref)
  });
}

const disposers: Array<() => void> = [];
beforeEach(() => installServerComponents(makeHost()));
afterEach(() => {
  for (const d of disposers.splice(0)) d();
  attribution.disable();
  flush();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function capture() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const events: DiagnosticEvent[] = [];
  disposers.push(
    OBSERVE!.diagnostics.subscribe(e => {
      if (e.code === "ASYNC_WATERFALL") events.push(e);
    })
  );
  attribution.enable({
    log: false,
    hotRuns: false,
    hotTime: false,
    waterfalls: { minFlightMs: 0 }
  });
  return events;
}

const chainNames = (e: DiagnosticEvent) => (e.data!.chain as { name: string }[]).map(l => l.name);

/** The server: the response header and `start` leave at the call; the body lands on `finish`. */
function stubServer() {
  let controller!: ReadableStreamDefaultController;
  const send = (chunk: any) => controller.enqueue(createChunk(JSON.stringify(chunk)));
  const fetches: number[] = [];
  vi.stubGlobal("fetch", async () => {
    fetches.push(performance.now());
    const body = new ReadableStream({ start: c => (controller = c) });
    send({ type: "start", id: "srv", version: 1 });
    return new Response(body, { headers: { "X-Frame-Stream": "srv" } });
  });
  return {
    fetches,
    finish() {
      send({ type: "html", id: "srv", version: 1, html: "<p>Frame finished</p>" });
      send({ type: "complete", id: "srv", version: 1 });
      controller.close();
    }
  };
}

async function tick() {
  flush();
  await wait();
  flush();
  await wait();
}

async function until(cond: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    await tick();
    if (cond()) return;
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Mounts `source` behind a gate the test releases, under one <Loading>. */
function mount(source: () => any) {
  let release!: (v: true) => void;
  let div!: HTMLDivElement;
  let mounted = 0;
  disposers.push(
    createRoot(d => {
      const ready = createMemo(() => new Promise<true>(r => (release = r)), { name: "ready" });
      const Panel = dynamic(() => (mounted++, source()));
      <div ref={div}>
        <Loading fallback={<span>loading</span>}>
          <Show when={ready()}>
            <Panel />
          </Show>
        </Loading>
      </div>;
      document.body.appendChild(div);
      return () => (d(), div.remove());
    })
  );
  return { div, release: () => release(true), mounted: () => mounted > 0 };
}

describe("a late consumer of a streaming frame response (#4140)", () => {
  test("keeps the call's start as the landing's origin: no ASYNC_WATERFALL", async () => {
    const events = capture();
    const server = stubServer();
    const reference = await getPanel();
    const [panel, setPanel] = createSignal<any>();
    setPanel(() => reference);

    const { div, release, mounted } = mount(() => panel());
    await tick();
    expect(mounted()).toBe(false);
    await wait(10);
    release();
    await until(mounted, "the consumer to mount");
    expect(div.textContent).toBe("loading");

    await wait(10);
    server.finish();
    await until(() => div.textContent === "Frame finished", "the frame to land");
    await wait(10);
    await tick();

    expect(server.fetches).toHaveLength(1);
    expect(events).toEqual([]);
  });

  test("a call made only after the gate is still one", async () => {
    const events = capture();
    const server = stubServer();

    const { div, release } = mount(() => getPanel() as any);
    await tick();
    expect(server.fetches).toHaveLength(0);
    await wait(10);
    release();
    await until(() => server.fetches.length === 1, "the call to leave");
    expect(div.textContent).toBe("loading");

    await wait(10);
    server.finish();
    await until(() => div.textContent === "Frame finished", "the frame to land");
    await wait(10);
    await tick();

    // The call's own promise, started at the gate's landing, is the link; the
    // frame's landing began with the call and is not a third one.
    expect(events.map(chainNames)).toEqual([["ready", "computed"]]);
    expect(events[0].severity).toBe("info");
  });
});
