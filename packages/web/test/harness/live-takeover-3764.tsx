/**
 * @jsxImportSource @solidjs/web
 *
 * Shared by the server spec (writes the chunk artifacts) and the hydration
 * spec (replays them); `control` gates the live source's first yield.
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
