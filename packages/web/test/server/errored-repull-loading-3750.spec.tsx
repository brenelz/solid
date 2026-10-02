/**
 * @jsxImportSource @solidjs/web
 */
// Repro for solidjs/solid#3750: a root hole settling re-pulls the provider's
// children, so the <Errored> re-renders its subtree while the <Loading>
// inside it still awaits a stable promise. Built with createComponent calls,
// the issue's shape: compiled JSX wraps the children in memos.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Errored, Loading, renderToStream } from "@solidjs/web";
import {
  OBSERVE,
  Show,
  createComponent,
  createContext,
  createMemo,
  type BoundaryEvent,
  type DiagnosticEvent
} from "solid-js";

function delay<T>(ms: number, value: T) {
  return new Promise<T>(r => setTimeout(() => r(value), ms));
}

let capture: ReturnType<NonNullable<typeof OBSERVE>["diagnostics"]["capture"]>;
let records: BoundaryEvent[];
let unsubscribe: () => void;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  capture = OBSERVE!.diagnostics.capture();
  records = [];
  unsubscribe = OBSERVE!.records.subscribe("boundary", event => {
    records.push(event);
  });
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  capture.stop();
  unsubscribe();
  error.mockRestore();
});
const byCode = (code: DiagnosticEvent["code"]) => capture.events.filter(e => e.code === code);

// A stale instance's spin to the convergence budget outlives the response.
async function render(code: () => any) {
  const html = await renderToStream(code);
  await delay(300);
  return html;
}

const Context = createContext<boolean>();

function makeApp(outer: boolean) {
  const session = delay(30, "SESSION_READY");
  function Page() {
    const data = createMemo(() => session);
    return createComponent(Loading, {
      fallback: "pending",
      get children() {
        return createComponent(Show, {
          get when() {
            return data();
          },
          children: "SESSION_READY"
        });
      }
    });
  }
  const Shell = () =>
    createComponent(Errored, {
      fallback: (e: any) => e().message,
      get children() {
        return createComponent(Page, {});
      }
    });
  return () => {
    const later = createMemo(() => delay(10, "LATER"));
    return createComponent(Context, {
      value: true,
      get children() {
        return [
          outer
            ? createComponent(Loading, {
                fallback: "outer",
                get children() {
                  return createComponent(Shell, {});
                }
              })
            : createComponent(Shell, {}),
          () => later()
        ];
      }
    });
  };
}

describe("#3750 an <Errored> re-pulled while its <Loading> is still resuming", () => {
  test("the stable promise settles the re-created boundary without a convergence error", async () => {
    const html = await render(makeApp(false));
    expect(byCode("SSR_RENDER_ERROR_CONTAINED")).toEqual([]);
    expect(byCode("SSR_BOUNDARY_WATERFALL")).toEqual([]);
    expect(html).toContain("SESSION_READY");
    expect(html).toContain("LATER");
    expect(records.map(e => [e.outcome, e.passes])).toEqual([["settled", 2]]);
  });

  test("with an outer <Loading> around the <Errored>", async () => {
    const html = await render(makeApp(true));
    expect(byCode("SSR_RENDER_ERROR_CONTAINED")).toEqual([]);
    expect(html).toContain("SESSION_READY");
    expect(records.map(e => [e.outcome, e.passes])).toEqual([["settled", 2]]);
  });
});
