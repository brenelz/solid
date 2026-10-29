/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
import { expect, test } from "vitest";
import {
  Errored,
  For,
  Loading,
  Show,
  createMemo,
  flush,
  refresh,
  type Refreshable
} from "solid-js";
import { render } from "../src/index.js";

async function tick() {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    flush();
  }
}

for (const nested of [true, false]) {
  test(`#4425: an Errored recovers at its retry's landing (nested Loading: ${nested})`, async () => {
    const asks: { key: string; res: (v: any) => void }[] = [];
    const ask = (key: string) => new Promise<any>(res => asks.push({ key, res }));
    const land = async (key: string, v: any) => {
      const i = asks.findIndex(a => a.key === key);
      if (i < 0) throw new Error(`not asked ${key}: ${asks.map(a => a.key)}`);
      asks.splice(i, 1)[0].res(v);
      await tick();
    };
    const container = document.body.appendChild(document.createElement("div"));
    let detail!: Refreshable<() => any>;
    function Related(props: { title: string }) {
      const hits = createMemo(() => ask(`search:${props.title}`));
      return (
        <Loading fallback={<i>finding</i>}>
          <For each={hits()}>{(h: any) => <i>{h}</i>}</For>
        </Loading>
      );
    }
    const dispose = render(() => {
      detail = createMemo(async () => {
        const d = await ask("detail");
        if (!d) throw new Error("not found");
        return d;
      });
      return (
        <Loading fallback={<p>loading</p>}>
          <Errored fallback={(e: any) => <p>err {e().message}</p>}>
            <h2>{detail().title}</h2>
            {nested && <Show when={detail()}>{(d: any) => <Related title={d().title} />}</Show>}
          </Errored>
        </Loading>
      );
    }, container);
    try {
      await tick();
      expect(container.textContent).toBe("loading");
      await land("detail", null);
      expect(container.textContent).toBe("err not found");
      refresh(detail);
      flush();
      await tick();
      expect(container.textContent).toBe("err not found");
      await land("detail", { title: "Crash" });
      expect(container.textContent).toBe(nested ? "Crashfinding" : "Crash");
      if (nested) {
        await land("search:Crash", ["a", "b"]);
        expect(container.textContent).toBe("Crashab");
      }
    } finally {
      dispose();
      container.remove();
    }
  });
}
