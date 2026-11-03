/**
 * @jsxImportSource @solidjs/web
 *
 * solidjs/solid#4646 — aborting `renderToStream`'s `signal` tore the render
 * down but left `await renderToStream(...)` pending forever: the thenable
 * settled only through `onCompleteAll` or the render-failure completion,
 * and a disconnect runs neither; `pipeTo`'s promise hung the same way. Both
 * now settle on the abort — the thenable with whatever HTML the render
 * produced, the way a render failure completes it — while the sinks are left
 * alone, as a disconnect always left them.
 */
import { getEventListeners } from "node:events";
import { describe, expect, test } from "vitest";
import { renderToStream, Loading, type ServerErrorContext } from "@solidjs/web";
import { createMemo } from "solid-js";
import { settle, watchEscapes } from "./stream-settle-harness.js";

function Held() {
  const held = createMemo(() => new Promise<string>(() => {}));
  return <main>{held()}</main>;
}

function recorder() {
  const heard: { error: unknown; context: ServerErrorContext }[] = [];
  const onError = (error: unknown, context: ServerErrorContext) => {
    heard.push({ error, context });
  };
  return { heard, onError };
}

describe("renderToStream: the awaited form settles when the signal aborts (#4646)", () => {
  test("an abort before the shell resolves with the HTML produced so far (none)", async () => {
    const { heard, onError } = recorder();
    const controller = new AbortController();
    let outcome: Awaited<ReturnType<typeof settle>> | undefined;
    const escaped = await watchEscapes(async () => {
      const pending = settle(
        renderToStream(() => <Held />, { onError, signal: controller.signal })
      );
      setTimeout(() => controller.abort(new Error("client disconnected")), 10);
      outcome = await pending;
    });
    expect(escaped).toEqual([]);
    expect(outcome).toEqual({ state: "settled", html: "" });
    expect(heard).toEqual([]);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  test("a signal already aborted when the render starts resolves too", async () => {
    const { heard, onError } = recorder();
    const controller = new AbortController();
    controller.abort();
    let outcome: Awaited<ReturnType<typeof settle>> | undefined;
    const escaped = await watchEscapes(async () => {
      outcome = await settle(
        renderToStream(() => <Held />, { onError, signal: controller.signal })
      );
    });
    expect(escaped).toEqual([]);
    expect(outcome).toEqual({ state: "settled", html: "" });
    expect(heard).toEqual([]);
  });

  test("every then() registered settles, before and after the abort", async () => {
    const controller = new AbortController();
    const stream = renderToStream(() => <Held />, { signal: controller.signal });
    const before = settle(stream);
    controller.abort();
    const after = settle(stream);
    expect(await before).toEqual({ state: "settled", html: "" });
    expect(await after).toEqual({ state: "settled", html: "" });
  });

  test("an abort after the shell flushed to a pipe sink settles a then() beside it", async () => {
    const controller = new AbortController();
    const App = () => (
      <Loading fallback="waiting">
        <Held />
      </Loading>
    );
    let shell = "";
    let ended = false;
    const stream = renderToStream(() => <App />, { signal: controller.signal });
    const shellWritten = new Promise<void>(resolve => {
      stream.pipe({
        write(chunk: string) {
          shell += chunk;
          resolve();
        },
        end() {
          ended = true;
        }
      });
    });
    const pending = settle(stream);
    await shellWritten;
    expect(shell).toContain("waiting");
    controller.abort();
    expect(await pending).toMatchObject({ state: "settled" });
    expect(ended).toBe(false);
  });

  test("pipeTo()'s promise settles on an abort before the shell, the writable untouched", async () => {
    const controller = new AbortController();
    const { writable } = new TransformStream();
    const pending = settle(
      renderToStream(() => <Held />, { signal: controller.signal })
        .pipeTo(writable)
        .then(() => "")
    );
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual({ state: "settled", html: "" });
    expect(writable.locked).toBe(false);
  });

  test("pipeTo()'s promise settles on an abort after the shell, the writable left open", async () => {
    const controller = new AbortController();
    const App = () => (
      <Loading fallback="waiting">
        <Held />
      </Loading>
    );
    const { readable, writable } = new TransformStream();
    const pending = settle(
      renderToStream(() => <App />, { signal: controller.signal })
        .pipeTo(writable)
        .then(() => "")
    );
    const reader = readable.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("waiting");
    controller.abort();
    expect(await pending).toEqual({ state: "settled", html: "" });
    expect(writable.locked).toBe(true);
  });
});
