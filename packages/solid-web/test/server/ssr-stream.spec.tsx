/**
 * @jsxImportSource solid-js
 */
import { describe, expect, test, vi } from "vitest";
import {
  renderToString,
  renderToStream,
  Loading,
  Show,
  For,
  Switch,
  Match,
  Errored
} from "@solidjs/web";
import { createMemo } from "solid-js";

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function asyncValue<T>(value: T, ms = 10): Promise<T> {
  return new Promise(r => setTimeout(() => r(value), ms));
}

function renderComplete(code: () => any, options: any = {}): Promise<string> {
  return new Promise(resolve => {
    renderToStream(code, options).then(resolve);
  });
}

function collectChunks(
  code: () => any,
  options: any = {}
): Promise<{ chunks: string[]; shell: string }> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    let shell = "";
    let shellDone = false;
    renderToStream(code, {
      ...options,
      onCompleteShell() {
        shellDone = true;
      }
    }).pipe({
      write(chunk: string) {
        chunks.push(chunk);
        if (shellDone && !shell) {
          shell = chunks.join("");
        }
      },
      end() {
        if (!shell) shell = chunks.join("");
        resolve({ chunks, shell });
      }
    });
  });
}

// --- Tests ---

describe("SSR Streaming — No Loading Boundary", () => {
  test("top-level async memo blocks the shell", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("TopLevel", 30));
      return (
        <div>
          <p>{data()}</p>
        </div>
      );
    }

    const { shell } = await collectChunks(() => <App />);
    expect(shell).toContain("TopLevel");
  });

  test("top-level async memo resolves in .then() path", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("Resolved", 20));
      return <p>{data()}</p>;
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Resolved");
  });

  test("async memo above Loading boundary blocks shell, inner streams", async () => {
    function App() {
      const outer = createMemo(async () => asyncValue("Outer", 20));
      const inner = createMemo(async () => asyncValue("Inner", 60));
      return (
        <div>
          <h1>{outer()}</h1>
          <Loading fallback={<span>Loading inner...</span>}>
            <p>{inner()}</p>
          </Loading>
        </div>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Outer");
    expect(shell).toContain("Loading inner...");
    expect(full).toContain("Inner");
  });

  test("multiple top-level async memos all block the shell", async () => {
    function App() {
      const a = createMemo(async () => asyncValue("Alpha", 10));
      const b = createMemo(async () => asyncValue("Beta", 30));
      return (
        <div>
          <p>{a()}</p>
          <p>{b()}</p>
        </div>
      );
    }

    const { shell } = await collectChunks(() => <App />);
    expect(shell).toContain("Alpha");
    expect(shell).toContain("Beta");
  });
});

describe("SSR Streaming — Basic Rendering", () => {
  test("sync component renders to HTML", async () => {
    const html = await renderComplete(() => (
      <div>
        <h1>Hello</h1>
        <p>World</p>
      </div>
    ));
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  test("async memo in Loading boundary", async () => {
    function App() {
      const data = createMemo(async () => {
        return asyncValue("Loaded Data");
      });
      return (
        <div>
          <Loading fallback={<span>Loading...</span>}>
            <p>{data()}</p>
          </Loading>
        </div>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Loaded Data");
  });

  test("async memo — shell contains fallback, final has resolved value", async () => {
    function App() {
      const data = createMemo(async () => {
        return asyncValue("Resolved", 50);
      });
      return (
        <div>
          <Loading fallback={<span>Fallback</span>}>
            <p>{data()}</p>
          </Loading>
        </div>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Fallback");
    expect(full).toContain("Resolved");
    expect(full).toContain("<template");
  });

  test("parallel async boundaries", async () => {
    function App() {
      const fast = createMemo(async () => asyncValue("Fast", 10));
      const slow = createMemo(async () => asyncValue("Slow", 50));
      return (
        <div>
          <Loading fallback={<span>Loading fast...</span>}>
            <p>{fast()}</p>
          </Loading>
          <Loading fallback={<span>Loading slow...</span>}>
            <p>{slow()}</p>
          </Loading>
        </div>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Loading fast...");
    expect(shell).toContain("Loading slow...");
    expect(full).toContain("Fast");
    expect(full).toContain("Slow");
  });

  test("nested Loading boundaries", async () => {
    function App() {
      const outer = createMemo(async () => asyncValue("Outer", 20));
      const inner = createMemo(async () => asyncValue("Inner", 40));
      return (
        <Loading fallback={<span>Outer loading</span>}>
          <div>
            <p>{outer()}</p>
            <Loading fallback={<span>Inner loading</span>}>
              <p>{inner()}</p>
            </Loading>
          </div>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Outer");
    expect(html).toContain("Inner");
  });
});

describe("SSR Streaming — deferStream", () => {
  test("deferStream blocks the shell until resolved", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("Deferred", 50), undefined, {
        deferStream: true
      });
      return (
        <div>
          <Loading fallback={<span>Fallback</span>}>
            <p>{data()}</p>
          </Loading>
        </div>
      );
    }

    const { shell } = await collectChunks(() => <App />);
    expect(shell).toContain("Deferred");
    expect(shell).not.toContain("Fallback");
  });

  test("mixed deferred and non-deferred", async () => {
    function App() {
      const deferred = createMemo(async () => asyncValue("Deferred", 30), undefined, {
        deferStream: true
      });
      const streamed = createMemo(async () => asyncValue("Streamed", 60));
      return (
        <div>
          <Loading fallback={<span>Deferred loading</span>}>
            <p>{deferred()}</p>
          </Loading>
          <Loading fallback={<span>Streamed loading</span>}>
            <p>{streamed()}</p>
          </Loading>
        </div>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Deferred");
    expect(shell).not.toContain("Deferred loading");
    expect(shell).toContain("Streamed loading");
    expect(full).toContain("Streamed");
  });
});

describe("SSR Streaming — Error Handling", () => {
  test("error in async computation caught by Errored boundary", async () => {
    function App() {
      const data = createMemo(async () => {
        await delay(10);
        throw new Error("Boom");
      });
      return (
        <Errored fallback={(err: Error) => <span>Error: {err.message}</span>}>
          <Loading fallback={<span>Loading...</span>}>
            <p>{data()}</p>
          </Loading>
        </Errored>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Error:");
    expect(html).toContain("Boom");
  });

  test("stream completes after error (no hang)", async () => {
    function App() {
      const data = createMemo(async () => {
        await delay(10);
        throw new Error("Fail");
      });
      return (
        <Errored fallback={(err: Error) => <span>Caught</span>}>
          <Loading fallback={<span>Loading</span>}>
            <p>{data()}</p>
          </Loading>
        </Errored>
      );
    }

    const { chunks, shell } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Loading");
    expect(full).toContain("Error");
    expect(full).toContain("Fail");
    expect(full).toContain("$df");
  });
});

describe("SSR Streaming — Flow Controls", () => {
  test("Show with async memo", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("Visible", 20));
      return (
        <Loading fallback={<span>Loading...</span>}>
          <Show when={true}>
            <p>{data()}</p>
          </Show>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Visible");
  });

  test("For with async items", async () => {
    function App() {
      const items = createMemo(async () => asyncValue(["A", "B", "C"], 20));
      return (
        <Loading fallback={<span>Loading list...</span>}>
          <ul>
            <For each={items()}>{item => <li>{item()}</li>}</For>
          </ul>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("<li>A</li>");
    expect(html).toContain("<li>B</li>");
    expect(html).toContain("<li>C</li>");
  });

  test("Switch/Match with async memo", async () => {
    function App() {
      const status = createMemo(async () => asyncValue("active", 20));
      return (
        <Loading fallback={<span>Loading...</span>}>
          <Switch fallback={<span>Unknown</span>}>
            <Match when={status() === "active"}>
              <p>Active</p>
            </Match>
            <Match when={status() === "inactive"}>
              <p>Inactive</p>
            </Match>
          </Switch>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Active");
    expect(html).not.toContain("Inactive");
    expect(html).not.toContain("Unknown");
  });
});

describe("SSR Streaming — Multiple Async in One Boundary", () => {
  test("two async memos in one Loading boundary", async () => {
    function App() {
      const name = createMemo(async () => asyncValue("Alice", 10));
      const role = createMemo(async () => asyncValue("Admin", 30));
      return (
        <Loading fallback={<span>Loading profile...</span>}>
          <div>
            <p>{name()}</p>
            <p>{role()}</p>
          </div>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Alice");
    expect(html).toContain("Admin");
  });

  test("two async memos in one Loading — shell shows fallback, stream has both", async () => {
    function App() {
      const a = createMemo(async () => asyncValue("First", 10));
      const b = createMemo(async () => asyncValue("Second", 50));
      return (
        <Loading fallback={<span>Wait...</span>}>
          <p>{a()}</p>
          <p>{b()}</p>
        </Loading>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Wait...");
    expect(full).toContain("First");
    expect(full).toContain("Second");
  });
});

describe("SSR Streaming — Chained Async", () => {
  test("sync memo derived from async memo resolves", async () => {
    function App() {
      const base = createMemo(async () => asyncValue("hello", 20));
      const derived = createMemo(() => (base() as string).toUpperCase());
      return (
        <Loading fallback={<span>Loading...</span>}>
          <p>{derived()}</p>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("HELLO");
  });

  test("sync memo derived from async — streams correctly", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("world", 30));
      const greeting = createMemo(() => `Hello ${data()}`);
      return (
        <Loading fallback={<span>Loading...</span>}>
          <p>{greeting()}</p>
        </Loading>
      );
    }

    const { shell, chunks } = await collectChunks(() => <App />);
    const full = chunks.join("");
    expect(shell).toContain("Loading...");
    expect(full).toContain("Hello world");
  });
});

describe("SSR Streaming — Edge Cases", () => {
  test("fast async resolves before shell flush (0ms)", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("Instant", 0));
      return (
        <Loading fallback={<span>Fallback</span>}>
          <p>{data()}</p>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("Instant");
  });

  test("async resolving to null renders empty", async () => {
    function App() {
      const data = createMemo(async () => asyncValue(null, 10));
      return (
        <Loading fallback={<span>Loading...</span>}>
          <div>{data()}</div>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("<div>");
    expect(html).not.toContain("Loading...");
  });

  test("async resolving to undefined renders empty", async () => {
    function App() {
      const data = createMemo(async () => asyncValue(undefined, 10));
      return (
        <Loading fallback={<span>Loading...</span>}>
          <div>{data()}</div>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("<div>");
    expect(html).not.toContain("Loading...");
  });

  test("async resolving to empty string renders empty", async () => {
    function App() {
      const data = createMemo(async () => asyncValue("", 10));
      return (
        <Loading fallback={<span>Loading...</span>}>
          <div>{data()}</div>
        </Loading>
      );
    }

    const html = await renderComplete(() => <App />);
    expect(html).toContain("<div>");
    expect(html).not.toContain("Loading...");
  });
});

describe("renderToString — Sync Rendering", () => {
  test("sync component renders to string", () => {
    const html = renderToString(() => (
      <div>
        <h1>Hello</h1>
        <p>World</p>
      </div>
    ));
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  test("nested sync components", () => {
    function Child(props: { name: string }) {
      return <span>{props.name}</span>;
    }
    function App() {
      return (
        <div>
          <Child name="Alice" />
          <Child name="Bob" />
        </div>
      );
    }

    const html = renderToString(() => <App />);
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  test("sync flow controls render correctly", () => {
    const html = renderToString(() => (
      <div>
        <Show when={true}>
          <p>Visible</p>
        </Show>
        <Show when={false}>
          <p>Hidden</p>
        </Show>
        <For each={["X", "Y"]}>{item => <span>{item()}</span>}</For>
      </div>
    ));
    expect(html).toContain("Visible");
    expect(html).not.toContain("Hidden");
    expect(html).toContain("X");
    expect(html).toContain("Y");
  });

  test("throws on async content without Loading boundary", () => {
    function App() {
      const data = createMemo(async () => asyncValue("Never", 10));
      return <p>{data()}</p>;
    }

    expect(() => renderToString(() => <App />)).toThrow();
  });

  test("noScripts suppresses script injection", () => {
    const html = renderToString(() => <div>Content</div>, { noScripts: true });
    expect(html).toContain("Content");
    expect(html).not.toContain("<script");
  });
});

describe("SSR Streaming — Callbacks", () => {
  test("onCompleteShell fires after blocking promises", async () => {
    let shellFired = false;
    let shellHtml = "";

    function App() {
      const data = createMemo(async () => asyncValue("Ready", 30), undefined, {
        deferStream: true
      });
      return (
        <Loading fallback={<span>Wait</span>}>
          <p>{data()}</p>
        </Loading>
      );
    }

    await new Promise<void>(resolve => {
      renderToStream(() => <App />, {
        onCompleteShell({ write }: { write: (v: string) => void }) {
          shellFired = true;
        }
      }).pipe({
        write(chunk: string) {
          if (shellFired && !shellHtml) shellHtml = chunk;
        },
        end() {
          resolve();
        }
      });
    });

    expect(shellFired).toBe(true);
    expect(shellHtml).toContain("Ready");
  });

  test("onCompleteAll fires after all fragments", async () => {
    let allFired = false;

    function App() {
      const data = createMemo(async () => asyncValue("Done", 20));
      return (
        <Loading fallback={<span>Loading</span>}>
          <p>{data()}</p>
        </Loading>
      );
    }

    const html = await new Promise<string>(resolve => {
      renderToStream(() => <App />, {
        onCompleteAll() {
          allFired = true;
        }
      }).then(resolve);
    });

    expect(allFired).toBe(true);
    expect(html).toContain("Done");
  });
});
