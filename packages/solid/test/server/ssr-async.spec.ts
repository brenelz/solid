/** @vitest-environment node */
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import {
  createRoot,
  createMemo,
  NotReadyError,
  getOwner,
  For,
  Show,
  Errored
} from "../../src/server/index.js";
import { Loading, ssrHandleError } from "../../src/server/hydration.js";
import { sharedConfig } from "../../src/server/shared.js";
import { createErrorBoundary } from "../../src/server/signals.js";

// ============================================================================
// Mock SSR Context Infrastructure
// ============================================================================
//
// These functions replicate the core template resolution logic from
// dom-expressions/src/server.js. At runtime, dom-expressions provides them
// as ctx.resolve, ctx.ssr, and ctx.escape on sharedConfig.context. For
// isolated unit testing of Loading's async behavior, we inline minimal
// but faithful copies here.

type SSRTemplateObject = { t: string[]; h: Function[]; p: Promise<any>[] };

function resolveSSRNode(
  node: any,
  result: SSRTemplateObject = { t: [""], h: [], p: [] },
  top?: boolean
): SSRTemplateObject {
  const t = typeof node;
  if (t === "string" || t === "number") {
    result.t[result.t.length - 1] += node;
  } else if (node == null || t === "boolean") {
    // skip
  } else if (Array.isArray(node)) {
    let prev: any = {};
    for (let i = 0, len = node.length; i < len; i++) {
      if (!top && typeof prev !== "object" && typeof node[i] !== "object")
        result.t[result.t.length - 1] += `<!--!$-->`;
      resolveSSRNode((prev = node[i]), result);
    }
  } else if (t === "object") {
    if (node.h) {
      result.t[result.t.length - 1] += node.t[0];
      if (node.t.length > 1) {
        result.t.push(...node.t.slice(1));
        result.h.push(...node.h);
        result.p.push(...node.p);
      }
    } else result.t[result.t.length - 1] += node.t;
  } else if (t === "function") {
    try {
      resolveSSRNode(node(), result);
    } catch (err) {
      const p = ssrHandleError(err);
      if (p) {
        result.h.push(node);
        result.p.push(p);
        result.t.push("");
      }
    }
  }
  return result;
}

function resolveSSR(
  template: string[],
  holes: any[],
  result: SSRTemplateObject = { t: [""], h: [], p: [] }
): SSRTemplateObject {
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    result.t[result.t.length - 1] += template[i];
    if (hole == null || hole === true || hole === false) continue;
    resolveSSRNode(hole, result);
  }
  result.t[result.t.length - 1] += template[template.length - 1];
  return result;
}

function ssr(t: string[], ...nodes: any[]): SSRTemplateObject {
  if (nodes.length) return resolveSSR(t, nodes);
  return { t } as any;
}

function escape(s: any, attr?: boolean): any {
  const t = typeof s;
  if (t !== "string") {
    if (!attr && Array.isArray(s)) {
      s = s.slice();
      for (let i = 0; i < s.length; i++) s[i] = escape(s[i]);
      return s;
    }
    if (attr && t === "boolean") return s;
    return s;
  }
  const delim = attr ? '"' : "<";
  const escDelim = attr ? "&quot;" : "&lt;";
  let iDelim = s.indexOf(delim);
  let iAmp = s.indexOf("&");
  if (iDelim < 0 && iAmp < 0) return s;
  let left = 0,
    out = "";
  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) out += s.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = s.indexOf(delim, left);
    } else {
      if (left < iAmp) out += s.substring(left, iAmp);
      out += "&amp;";
      left = iAmp + 1;
      iAmp = s.indexOf("&", left);
    }
  }
  if (iDelim >= 0) {
    do {
      if (left < iDelim) out += s.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = s.indexOf(delim, left);
    } while (iDelim >= 0);
  } else
    while (iAmp >= 0) {
      if (left < iAmp) out += s.substring(left, iAmp);
      out += "&amp;";
      left = iAmp + 1;
      iAmp = s.indexOf("&", left);
    }
  return left < s.length ? out + s.substring(left) : out;
}

// ---- Test utilities ----

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockSSRContext(options: { async?: boolean } = {}) {
  const serialized = new Map<string, any>();
  const registeredFragments = new Set<string>();
  const fragmentResults = new Map<string, string | undefined>();
  const fragmentErrors = new Map<string, any>();

  const context: any = {
    async: options.async !== false,
    assets: [],
    nonce: undefined,
    noHydrate: false,
    escape,
    resolve: resolveSSRNode,
    ssr,
    serialize(id: string, p: any) {
      serialized.set(id, p);
    },
    replace() {},
    block() {},
    registerFragment(key: string) {
      registeredFragments.add(key);
      return (value?: string, error?: any) => {
        fragmentResults.set(key, value);
        if (error !== undefined) fragmentErrors.set(key, error);
        return true;
      };
    }
  };

  return { context, serialized, registeredFragments, fragmentResults, fragmentErrors };
}

/** Wait for microtasks and pending async to settle. */
function tick() {
  return new Promise<void>(r => setTimeout(r, 0));
}

// ============================================================================
// Tests
// ============================================================================

describe("Loading SSR Async", () => {
  let savedContext: any;

  beforeEach(() => {
    savedContext = sharedConfig.context;
  });

  afterEach(() => {
    sharedConfig.context = savedContext;
  });

  // --------------------------------------------------------------------------
  // 1. Basic Async (hole path)
  // --------------------------------------------------------------------------

  describe("Basic Async (hole path)", () => {
    test("single async memo resolves through hole re-execution", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => d.promise);
              return ssr(["<div>", "</div>"], () => data()) as any;
            }
          });
        },
        { id: "t" }
      );

      // Should return fallback with placeholder markers
      expect(result.t[0]).toContain("Loading...");
      expect(result.t[0]).toMatch(/<template id="pl-[^"]+"><\/template>/);
      expect(result.t[0]).toMatch(/<!--pl-[^-]+-->/);

      // Resolve the async value
      d.resolve("Hello World");
      await tick();

      // Fragment should have resolved with correct HTML
      expect(fragmentResults.size).toBe(1);
      const resolved = [...fragmentResults.values()][0];
      expect(resolved).toBe("<div>Hello World</div>");
    });

    test("synchronous children bypass async path entirely", () => {
      const { context, registeredFragments } = createMockSSRContext();
      sharedConfig.context = context;

      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              return ssr(["<div>Hello</div>"]) as any;
            }
          });
        },
        { id: "t" }
      );

      // No fragments registered — sync path
      expect(registeredFragments.size).toBe(0);
      // Result should contain the children, not the fallback
      expect(result.t[0]).toBe("<div>Hello</div>");
      expect(result.t[0]).not.toContain("Loading...");
    });

    test("done callback receives the fully resolved HTML", async () => {
      const { context, registeredFragments, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<number>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "wait",
            get children() {
              const num = createMemo(() => d.promise);
              return ssr(["<span>Count: ", "</span>"], () => num()) as any;
            }
          });
        },
        { id: "t" }
      );

      // Fragment registered
      expect(registeredFragments.size).toBe(1);
      // Not yet resolved
      expect(fragmentResults.size).toBe(0);

      d.resolve(42);
      await tick();

      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<span>Count: 42</span>");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Parallel Async
  // --------------------------------------------------------------------------

  describe("Parallel Async", () => {
    test("multiple independent async memos resolve in one pass", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const dA = deferred<string>();
      const dB = deferred<string>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              const a = createMemo(() => dA.promise);
              const b = createMemo(() => dB.promise);
              return ssr(
                ["<div>", " and ", "</div>"],
                () => a(),
                () => b()
              ) as any;
            }
          });
        },
        { id: "t" }
      );

      // Should be in async/fallback mode
      expect(result.t[0]).toContain("Loading...");

      // Resolve both
      dA.resolve("Alpha");
      dB.resolve("Beta");
      await tick();

      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>Alpha and Beta</div>");
    });

    test("waits for all memos before re-executing holes", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const dA = deferred<string>();
      const dB = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const a = createMemo(() => dA.promise);
              const b = createMemo(() => dB.promise);
              return ssr(
                ["<p>", "-", "</p>"],
                () => a(),
                () => b()
              ) as any;
            }
          });
        },
        { id: "t" }
      );

      // Resolve only A — B is still pending
      dA.resolve("A");
      await tick();

      // Fragment should NOT be resolved yet (Promise.all waits for both)
      expect(fragmentResults.size).toBe(0);

      // Now resolve B
      dB.resolve("B");
      await tick();

      // Now fragment should be resolved
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<p>A-B</p>");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Nested Boundaries
  // --------------------------------------------------------------------------

  describe("Nested Boundaries", () => {
    test("inner Loading handles async, outer Loading sees sync children", async () => {
      const { context, registeredFragments, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Outer loading",
            get children() {
              return Loading({
                fallback: "Inner loading",
                get children() {
                  const data = createMemo(() => d.promise);
                  return ssr(["<div>", "</div>"], () => data()) as any;
                }
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Only inner boundary should register a fragment
      expect(registeredFragments.size).toBe(1);

      // Outer boundary passes through — result is inner's fallback (not outer's)
      const html = result.t[0];
      expect(html).toContain("Inner loading");
      expect(html).not.toContain("Outer loading");
      expect(html).toMatch(/pl-/); // inner's placeholder markers

      d.resolve("Resolved");
      await tick();

      // Inner fragment resolves
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>Resolved</div>");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Chained Async
  // --------------------------------------------------------------------------

  describe("Chained Async", () => {
    test("memo depending on async memo resolves in one pass", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const base = createMemo(() => d.promise);
              // Derived memo depends on async base
              const derived = createMemo(() => (base() as string).toUpperCase());
              return ssr(["<div>", "</div>"], () => derived()) as any;
            }
          });
        },
        { id: "t" }
      );

      d.resolve("hello");
      await tick();

      // Chained resolution: base resolves → derived re-computes → single hole pass
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>HELLO</div>");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Conditional and List Async
  // --------------------------------------------------------------------------

  describe("Conditional Async", () => {
    test("async inside Show when=true propagates through", async () => {
      const { context, registeredFragments, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => d.promise);
              return Show({
                when: true,
                children: ssr(["<div>", "</div>"], () => data()) as any
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      expect(registeredFragments.size).toBe(1);

      d.resolve("Shown");
      await tick();

      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>Shown</div>");
    });

    test("async inside Show when=false produces no async", () => {
      const { context, registeredFragments } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => d.promise);
              return Show({
                when: false,
                fallback: ssr(["<span>No data</span>"]) as any,
                children: ssr(["<div>", "</div>"], () => data()) as any
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Show returns fallback (sync) — no async detected
      expect(registeredFragments.size).toBe(0);
      expect(result.t[0]).toBe("<span>No data</span>");
    });
  });

  describe("Async in For", () => {
    test("async inside For iterations captured as holes", async () => {
      const { context, registeredFragments, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading list...",
            get children() {
              const list = For({
                each: [1, 2, 3] as const,
                children: (item: () => number) => {
                  const data = createMemo(() => d.promise.then((v: string) => `${v}-${item()}`));
                  return ssr(["<li>", "</li>"], () => data()) as any;
                }
              });
              return ssr(["<ul>", "</ul>"], list) as any;
            }
          });
        },
        { id: "t" }
      );

      expect(registeredFragments.size).toBe(1);

      d.resolve("item");
      await tick();

      expect(fragmentResults.size).toBe(1);
      const resolved = [...fragmentResults.values()][0];
      expect(resolved).toContain("<li>item-1</li>");
      expect(resolved).toContain("<li>item-2</li>");
      expect(resolved).toContain("<li>item-3</li>");
    });
  });

  // --------------------------------------------------------------------------
  // 5b. Re-entrant Holes
  // --------------------------------------------------------------------------

  describe("Re-entrant Holes", () => {
    test("hole re-execution that reveals new async triggers another pass", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const dGate = deferred<string>();
      const dDetail = deferred<number>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              // Phase 1: gate memo is async
              const gate = createMemo(() => dGate.promise);
              // Phase 2: detail memo is also async (created eagerly, but only
              // read in the hole when gate resolves to "yes")
              const detail = createMemo(() => dDetail.promise);

              return ssr(["<div>", "</div>"], () => {
                const g = gate() as string;
                if (g === "yes") {
                  // Only reachable after gate resolves — reading detail
                  // throws NotReadyError, creating a NEW hole
                  return `detail:${detail()}`;
                }
                return `gate:${g}`;
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Pass 1: gate throws NotReadyError → hole captured
      expect(fragmentResults.size).toBe(0);

      // Resolve gate → hole re-executes → detail throws NotReadyError → new hole
      dGate.resolve("yes");
      await tick();

      // Fragment should NOT be resolved yet — detail is still pending
      expect(fragmentResults.size).toBe(0);

      // Resolve detail → second re-execution → all sync → done
      dDetail.resolve(42);
      await tick();

      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>detail:42</div>");
    });

    test("multiple re-entrant passes resolve correctly", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d1 = deferred<string>();
      const d2 = deferred<string>();
      const d3 = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const step1 = createMemo(() => d1.promise);
              const step2 = createMemo(() => d2.promise);
              const step3 = createMemo(() => d3.promise);

              return ssr(["<div>", "</div>"], () => {
                const s1 = step1() as string;
                if (s1 === "go") {
                  const s2 = step2() as string;
                  if (s2 === "go") {
                    return `final:${step3()}`;
                  }
                  return `at-step2:${s2}`;
                }
                return `at-step1:${s1}`;
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Pass 1: step1 throws
      expect(fragmentResults.size).toBe(0);

      // Resolve step1 → re-execute → step2 throws (new hole)
      d1.resolve("go");
      await tick();
      expect(fragmentResults.size).toBe(0);

      // Resolve step2 → re-execute → step3 throws (new hole)
      d2.resolve("go");
      await tick();
      expect(fragmentResults.size).toBe(0);

      // Resolve step3 → re-execute → all sync → done
      d3.resolve("done");
      await tick();

      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>final:done</div>");
    });

    test("re-entrant hole with error on second pass", async () => {
      const { context, fragmentResults, fragmentErrors } = createMockSSRContext();
      sharedConfig.context = context;

      const dGate = deferred<string>();
      const dDetail = deferred<number>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const gate = createMemo(() => dGate.promise);
              const detail = createMemo(() => dDetail.promise);

              return ssr(["<div>", "</div>"], () => {
                const g = gate() as string;
                if (g === "yes") {
                  return `detail:${detail()}`;
                }
                return `gate:${g}`;
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Pass 1: gate throws → hole captured
      dGate.resolve("yes");
      await tick();

      // Pass 2: detail throws → new hole captured. Now reject it.
      const detailError = new Error("Detail fetch failed");
      dDetail.reject(detailError);
      await tick();

      // Error should be serialized via done
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBeUndefined();
      expect(fragmentErrors.size).toBe(1);
      expect([...fragmentErrors.values()][0]).toBe(detailError);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Throw Path (boundary re-render)
  // --------------------------------------------------------------------------

  describe("Throw Path (boundary re-render)", () => {
    test("direct memo read in component body triggers full re-render", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let resolved = false;
      d.promise.then(() => {
        resolved = true;
      });

      let renderCount = 0;
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              renderCount++;
              const data = createMemo(() => {
                if (resolved) return "Hello World";
                return d.promise;
              });
              // Direct read in component body — NOT wrapped in template hole
              const val = data();
              return ssr(["<div>", "</div>"], val) as any;
            }
          });
        },
        { id: "t" }
      );

      // Should have rendered once (and thrown)
      expect(renderCount).toBe(1);
      // Should return fallback
      expect(result.t[0]).toContain("Loading...");

      d.resolve("Hello World");
      await tick();

      // Should have re-rendered (throw path calls runInitially again)
      expect(renderCount).toBe(2);
      // Fragment should resolve with correct content
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBe("<div>Hello World</div>");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Error Handling
  // --------------------------------------------------------------------------

  describe("Error + Async", () => {
    test("rejected promise calls done with error (does not hang the stream)", async () => {
      const { context, registeredFragments, fragmentResults, fragmentErrors } =
        createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => d.promise);
              return ssr(["<div>", "</div>"], () => data()) as any;
            }
          });
        },
        { id: "t" }
      );

      expect(registeredFragments.size).toBe(1);

      const fetchError = new Error("Fetch failed");
      d.reject(fetchError);
      await tick();

      // done() should have been called with the error — stream won't hang
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBeUndefined(); // no HTML value
      expect(fragmentErrors.size).toBe(1);
      expect([...fragmentErrors.values()][0]).toBe(fetchError);
    });

    test("pending promise keeps fragment unresolved", async () => {
      const { context, registeredFragments, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      // Promise that will never resolve — simulates a stalled fetch
      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => d.promise);
              return ssr(["<div>", "</div>"], () => data()) as any;
            }
          });
        },
        { id: "t" }
      );

      expect(registeredFragments.size).toBe(1);
      await tick();

      // Fragment stays unresolved while promise is pending
      expect(fragmentResults.size).toBe(0);
    });

    test("Errored inside Loading — sync error caught by Errored", () => {
      const { context, registeredFragments, serialized } = createMockSSRContext();
      sharedConfig.context = context;

      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Loading...",
            get children() {
              return Errored({
                fallback: "Error caught!",
                get children(): any {
                  throw new Error("Sync render error");
                }
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      // Errored catches sync error → renders fallback → Loading sees sync content
      expect(registeredFragments.size).toBe(0);
      expect(result.t[0]).toContain("Error caught!");
      expect(result.t[0]).not.toContain("Loading...");

      // Error should be serialized via ctx.serialize for client hydration
      const serializedValues = [...serialized.values()];
      const hasError = serializedValues.some(v => v instanceof Error);
      expect(hasError).toBe(true);
    });

    test("Errored inside Loading — async rejection serialized via done", async () => {
      const { context, registeredFragments, fragmentResults, fragmentErrors } =
        createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              return Errored({
                fallback: "Error caught!",
                get children() {
                  const data = createMemo(() => d.promise);
                  return ssr(["<div>", "</div>"], () => data()) as any;
                }
              }) as any;
            }
          });
        },
        { id: "t" }
      );

      expect(registeredFragments.size).toBe(1);

      const fetchError = new Error("Async fetch failed");
      d.reject(fetchError);
      await tick();

      // ErrorContext is NOT active during IIFE hole re-execution.
      // IIFE catch fires → done(undefined, err) → error serialized.
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBeUndefined();
      expect(fragmentErrors.size).toBe(1);
      expect([...fragmentErrors.values()][0]).toBe(fetchError);
    });

    test("No Errored — sync error during initial render propagates up", () => {
      const { context } = createMockSSRContext();
      sharedConfig.context = context;

      // Sync error with no Errored boundary escapes Loading entirely (pre-flush)
      expect(() => {
        createRoot(
          () => {
            Loading({
              fallback: "Loading...",
              get children(): any {
                throw new Error("Unhandled sync error");
              }
            });
          },
          { id: "t" }
        );
      }).toThrow("Unhandled sync error");
    });

    test("Throw path — error during re-render after async resolution", async () => {
      const { context, fragmentResults, fragmentErrors } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let resolved = false;
      d.promise.then(() => {
        resolved = true;
      });

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => {
                if (resolved) return "resolved";
                return d.promise;
              });
              // Direct read — throw path
              const val = data();
              if (resolved) {
                // On re-render after resolution, throw a regular error
                throw new Error("Re-render explosion");
              }
              return ssr(["<div>", "</div>"], val) as any;
            }
          });
        },
        { id: "t" }
      );

      d.resolve("resolved");
      await tick();

      // IIFE catch fires → done(undefined, err) → error serialized
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBeUndefined();
      expect(fragmentErrors.size).toBe(1);
      expect(([...fragmentErrors.values()][0] as Error).message).toBe("Re-render explosion");
    });

    test("Mixed: some holes resolve, then one errors", async () => {
      const { context, fragmentResults, fragmentErrors } = createMockSSRContext();
      sharedConfig.context = context;

      const dA = deferred<string>();
      const dB = deferred<string>();

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const a = createMemo(() => dA.promise);
              const b = createMemo(() => dB.promise);
              return ssr(
                ["<div>", " and ", "</div>"],
                () => a(),
                () => b()
              ) as any;
            }
          });
        },
        { id: "t" }
      );

      // Resolve A, reject B
      dA.resolve("Alpha");
      const bError = new Error("B failed");
      dB.reject(bError);
      await tick();

      // Promise.all rejects when B rejects → error serialized via done
      expect(fragmentResults.size).toBe(1);
      expect([...fragmentResults.values()][0]).toBeUndefined();
      expect(fragmentErrors.size).toBe(1);
      expect([...fragmentErrors.values()][0]).toBe(bError);
    });

    test("createErrorBoundary serializes error for client hydration", () => {
      const { context, serialized } = createMockSSRContext();
      sharedConfig.context = context;

      let fallbackError: unknown;

      createRoot(
        () => {
          const result = createErrorBoundary(
            () => {
              throw new Error("Boundary test error");
            },
            (err, reset) => {
              fallbackError = err;
              return "fallback rendered";
            }
          );
          // Invoke the accessor to get the result
          expect(result()).toBe("fallback rendered");
        },
        { id: "t" }
      );

      // Fallback should have received the error
      expect(fallbackError).toBeInstanceOf(Error);
      expect((fallbackError as Error).message).toBe("Boundary test error");

      // Error should be serialized for client hydration
      const serializedEntries = [...serialized.entries()];
      expect(serializedEntries.length).toBeGreaterThan(0);

      // Find the entry where the value is the error
      const errorEntry = serializedEntries.find(
        ([, v]) => v instanceof Error && v.message === "Boundary test error"
      );
      expect(errorEntry).toBeDefined();
      // The key should be the owner's ID (a string)
      expect(typeof errorEntry![0]).toBe("string");
    });
  });

  // --------------------------------------------------------------------------
  // 8. ID Stability
  // --------------------------------------------------------------------------

  describe("ID Stability", () => {
    test("hole path: memo owners persist across re-execution (IDs inherently stable)", async () => {
      const { context, serialized, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let memoOwnerId: string | undefined;

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const data = createMemo(() => {
                // Capture the owner ID during compute
                memoOwnerId = getOwner()?.id;
                return d.promise;
              });
              return ssr(["<div>", "</div>"], () => data()) as any;
            }
          });
        },
        { id: "t" }
      );

      const initialOwnerId = memoOwnerId;
      expect(initialOwnerId).toBeDefined();

      // In the hole path, memos are NOT re-created — only hole functions are
      // re-executed. The owner should be the same object.
      d.resolve("done");
      await tick();

      // After resolution, the same memo owner ID should still be valid.
      // The compute function doesn't re-run (only the hole function does),
      // so memoOwnerId hasn't changed.
      expect(memoOwnerId).toBe(initialOwnerId);

      // Verify serialized IDs are consistent
      expect(serialized.size).toBeGreaterThan(0);
    });

    test("throw path: IDs are stable across boundary re-renders", async () => {
      const { context, fragmentResults } = createMockSSRContext();
      sharedConfig.context = context;

      const d = deferred<string>();
      let resolved = false;
      d.promise.then(() => {
        resolved = true;
      });

      const allMemoIds: string[][] = [];

      createRoot(
        () => {
          Loading({
            fallback: "Loading...",
            get children() {
              const memoIds: string[] = [];

              const a = createMemo(() => {
                memoIds.push(getOwner()!.id!);
                return "static";
              });

              const b = createMemo(() => {
                memoIds.push(getOwner()!.id!);
                if (resolved) return "resolved";
                return d.promise;
              });

              allMemoIds.push(memoIds);

              // Direct read — throw path
              const val = b();
              return ssr(["<div>", "-", "</div>"], () => a(), val) as any;
            }
          });
        },
        { id: "t" }
      );

      d.resolve("resolved");
      await tick();

      // Should have been called twice (initial throw + successful re-render)
      expect(allMemoIds.length).toBe(2);
      // IDs should be identical — dispose resets _childCount so sequential
      // IDs are regenerated in the same order
      expect(allMemoIds[0]).toEqual(allMemoIds[1]);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Sync fallback mode (non-streaming)
  // --------------------------------------------------------------------------

  describe("Sync fallback mode", () => {
    test("non-async context serializes fallback marker", () => {
      const { context, serialized, registeredFragments } = createMockSSRContext({
        async: false
      });
      sharedConfig.context = context;

      const d = deferred<string>();
      let result: any;

      createRoot(
        () => {
          result = Loading({
            fallback: "Fallback",
            get children() {
              const data = createMemo(() => d.promise);
              return ssr(["<div>", "</div>"], () => data()) as any;
            }
          });
        },
        { id: "t" }
      );

      // No fragments registered (not async mode)
      expect(registeredFragments.size).toBe(0);
      // Should have serialized "$$f" marker for the boundary
      const serializedValues = [...serialized.values()];
      expect(serializedValues).toContain("$$f");
      // Result should be the fallback content
      expect(result).toBe("Fallback");
    });
  });
});
