/**
 * @jsxImportSource @solidjs/web
 *
 * Live markup holes (Stage 3) through Solid's real SSR compile + reactive
 * core: an async-iterable-fed memo read inside markup makes that hole live —
 * each yield commits, the hole's binding re-evaluates, and changed HTML
 * re-emits as a keyed `hole` chunk. This is the chat demo's shape (the
 * markdown memo), pinned at the integration layer.
 */
import { describe, expect, it } from "vitest";
import { createMemo, createSignal, lazy } from "solid-js";
import { Loading } from "@solidjs/web";
import { renderServerComponent } from "../../frames/src/frame-sink.js";

const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

/**
 * Pipe a frame stream, exposing the live chunk list and a waiter — sequencing
 * is chunk-driven, not sleep-driven, so the intended interleaving (push, see
 * it land, push again) holds under any scheduler load.
 */
function consume(stream: any) {
  const chunks: any[] = [];
  const waiters: { test: (c: any) => boolean; resolve: () => void }[] = [];
  const done = new Promise<void>(res =>
    stream.pipe({
      write: (c: any) => {
        chunks.push(c);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].test(c)) waiters.splice(i, 1)[0].resolve();
        }
      },
      end: res
    })
  );
  const until = (test: (c: any) => boolean) => {
    if (chunks.some(test)) return Promise.resolve();
    return new Promise<void>(resolve => waiters.push({ test, resolve }));
  };
  return { chunks, until, done };
}

/** A push-driven async iterable (the chat model's channel shape). */
function channel<T>() {
  const queue: T[] = [];
  let notify: (() => void) | null = null;
  let done = false;
  const wake = () => {
    notify?.();
    notify = null;
  };
  return {
    push(v: T) {
      queue.push(v);
      wake();
    },
    end() {
      done = true;
      wake();
    },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<T>> {
            while (queue.length === 0) {
              if (done) return { value: undefined as any, done: true };
              await new Promise<void>(r => (notify = r));
            }
            return { value: queue.shift()!, done: false };
          }
        };
      }
    } as AsyncIterable<T>
  };
}

describe("live markup holes over async-iterable memos (the chat shape)", () => {
  it("re-emits the hole per yield and completes when the iterable ends", async () => {
    const ch = channel<string>();
    const ServerComp = () => {
      const text = createMemo(() => ch.iterable);
      return (
        <Loading fallback={<p>typing</p>}>
          <div class="md" innerHTML={text()} />
        </Loading>
      );
    };
    const { chunks, until, done } = consume(
      renderServerComponent(ServerComp, { frame: { id: "f" } })
    );
    await tick();
    ch.push("<b>one</b>");
    // The first yield settles the boundary: wait for the fragment so the
    // second push is genuinely mid-response.
    await until(c => c.type === "fragment");
    ch.push("<b>one two</b>");
    await until(c => c.type === "hole" && c.html === "<b>one two</b>");
    ch.end();
    await done;

    // The reply revealed with the first yield's markup, marker-wrapped...
    const fragment = chunks.find(c => c.type === "fragment");
    expect(fragment.html).toMatch(/<!--lh:(\d+)--><b>one<\/b><!--lh:\/\1-->/);
    // ...the second yield re-emitted the hole (exactly once — the first
    // yield's value shipped in the fragment splice, so the baseline gate
    // suppressed its redundant re-emission)...
    const holes = chunks.filter(c => c.type === "hole");
    expect(holes.map(h => h.html)).toEqual(["<b>one two</b>"]);
    // ...and the response stayed open for the trace and completed when the
    // iterable ended (the ctx.hold release).
    expect(chunks[chunks.length - 1].type).toBe("complete");
  }, 8000);

  it("re-emits a hole whose markup has a conditional on a property (#4023)", async () => {
    type Message = { id: number; text: string; usage?: { tokens: number } };
    const ch = channel<{ messages: Message[] }>();
    const ServerComp = () => {
      const view = createMemo(() => ch.iterable);
      return (
        <Loading fallback={<p>typing</p>}>
          <ol>
            {view().messages.map(m => (
              <li data-id={m.id}>
                {m.text.length} {m.usage && <b>done</b>}
              </li>
            ))}
          </ol>
        </Loading>
      );
    };
    const { chunks, until, done } = consume(
      renderServerComponent(ServerComp, { frame: { id: "f" } })
    );
    await tick();
    ch.push({ messages: [{ id: 1, text: "one" }] });
    await until(c => c.type === "fragment");
    ch.push({ messages: [{ id: 1, text: "one two" }] });
    await until(c => c.type === "hole" && /7/.test(c.html));
    ch.push({ messages: [{ id: 1, text: "one two", usage: { tokens: 2 } }] });
    await until(c => c.type === "hole" && /<b>done<\/b>/.test(c.html));
    ch.end();
    await done;

    const text = (html: string) => html.replace(/<!--[$/]-->/g, "");
    const fragment = chunks.find(c => c.type === "fragment");
    expect(text(fragment.html)).toMatch(
      /^<ol><!--lh:(\d+)--><li data-id="1">3 <\/li><!--lh:\/\1--><\/ol>$/
    );
    const holes = chunks.filter(c => c.type === "hole");
    expect(holes.map(h => text(h.html))).toEqual([
      '<li data-id="1">7 </li>',
      '<li data-id="1">7 <b>done</b></li>'
    ]);
    expect(chunks[chunks.length - 1].type).toBe("complete");
  }, 8000);

  it("re-emits an attribute whose value has a conditional on a property", async () => {
    type Message = { text: string; usage?: { tokens: number } };
    const ch = channel<Message>();
    const ServerComp = () => {
      const view = createMemo(() => ch.iterable);
      return (
        <Loading fallback={<p>typing</p>}>
          <p class={view().usage ? "done" : "busy"}>{view().text}</p>
        </Loading>
      );
    };
    const { chunks, until, done } = consume(
      renderServerComponent(ServerComp, { frame: { id: "f" } })
    );
    await tick();
    ch.push({ text: "one" });
    await until(c => c.type === "fragment");
    ch.push({ text: "one two" });
    await until(c => c.type === "hole" && c.html === "one two");
    ch.push({ text: "one two", usage: { tokens: 2 } });
    await until(c => c.type === "attr");
    ch.end();
    await done;

    const fragment = chunks.find(c => c.type === "fragment");
    expect(fragment.html).toMatch(/<p data-lha="\d+"[^>]* class="busy">/);
    const attrs = chunks
      .flatMap(c => (c.type === "ops" ? c.ops : [c]))
      .filter(c => c.type === "attr");
    expect(attrs.map(a => a.attrs.replace(/ data-lha="\d+"/g, ""))).toEqual([' class="done"']);
    expect(chunks[chunks.length - 1].type).toBe("complete");
  }, 8000);

  it("latches a hole that renders a lazy component", async () => {
    const ch = channel<string>();
    let renders = 0;
    const Panel = (props: { text: string }) => {
      renders++;
      return <p>{props.text}</p>;
    };
    const LazyPanel = lazy(() => Promise.resolve({ default: Panel }), undefined, "./Panel.tsx");
    await LazyPanel.preload();
    const ServerComp = () => {
      const [open] = createSignal(true);
      const text = createMemo(() => ch.iterable);
      return (
        <Loading fallback={<p>typing</p>}>
          <div>{open() ? <LazyPanel text={text()} /> : null}</div>
        </Loading>
      );
    };
    const { chunks, until, done } = consume(
      renderServerComponent(ServerComp, {
        frame: { id: "f" },
        manifest: { "./Panel.tsx": { file: "assets/panel.js" } }
      })
    );
    await tick();
    ch.push("one");
    await until(c => c.type === "fragment");
    ch.push("one two");
    await until(c => c.type === "hole" && c.html === "one two");
    ch.end();
    await done;

    expect(renders).toBe(1);
    const fragment = chunks.find(c => c.type === "fragment");
    expect(fragment.html).toMatch(/^<div><p><!--lh:(\d+)-->one<!--lh:\/\1--><\/p><\/div>$/);
    const holes = chunks.filter(c => c.type === "hole");
    expect(holes.map(h => h.html)).toEqual(["one two"]);
    expect(chunks[chunks.length - 1].type).toBe("complete");
  }, 8000);
});
