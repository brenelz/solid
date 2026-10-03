/**
 * @jsxImportSource @solidjs/web
 *
 * Fixture for solidjs/solid#3764: a live source (an async iterable branded
 * `Symbol.for("solid.LiveSource")`) created OUTSIDE a streamed `<Loading>`
 * whose content reads it. The server takes the source's first value after a
 * delay, so the boundary flushes its fallback into the shell and streams the
 * content later. The client adopts the serialized value, and the node takes
 * over — reconnects to the live source — when the shell finishes hydrating,
 * before the boundary's fragment arrives.
 *
 * Shared by test/server/live-takeover-3764.spec.tsx (ssr generate, writes the
 * chunk artifacts) and test/hydration/live-takeover-3764.spec.tsx (dom
 * generate, replays them).
 *
 * `control` is the live source's first yield. On the server it is unused (the
 * server source is a plain promise); the hydrate spec swaps it for a gate so
 * the yield lands exactly when the test says.
 */
import { createMemo, Loading } from "solid-js";
import { isServer, Show } from "@solidjs/web";

const LIVE = Symbol.for("solid.LiveSource");
const ROWS = [{ id: 1 }, { id: 2 }];

export const control = {
  first: (): Promise<{ id: number }[]> => new Promise(r => setTimeout(() => r(ROWS), 5)),
  onConnect: (): void => {}
};

function source(): any {
  if (isServer) return new Promise(r => setTimeout(() => r(ROWS), 5));
  let sent = false;
  return {
    [LIVE]: true,
    [Symbol.asyncIterator]() {
      control.onConnect();
      return {
        next: () => {
          if (sent) return new Promise<never>(() => {});
          sent = true;
          return control.first().then(value => ({ done: false, value }));
        },
        return: () => Promise.resolve({ done: true, value: undefined })
      };
    }
  };
}

/** A memo over the live source, read by the boundary's content. */
export function MemoApp() {
  const rows = createMemo<{ id: number }[]>(() => source());
  return (
    <section>
      <Loading fallback={<span>loading</span>}>
        <Show when={rows().length > 0}>
          <ul>
            <li>rows: {rows().length}</li>
          </ul>
        </Show>
      </Loading>
    </section>
  );
}

export const variants = [
  { name: "live-takeover-3764-memo", App: MemoApp, content: "rows: 2", next: "rows: 3" }
] as const;
