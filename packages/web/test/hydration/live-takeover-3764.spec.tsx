/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * solidjs/solid#3764: a live source created outside a streamed `<Loading>`
 * whose content reads it. The node takes over — reconnects to the live
 * source — when the shell finishes hydrating, while the boundary still waits
 * for its fragment. The takeover run made the node read pending until the
 * first live yield landed, so the boundary resuming in between selected its
 * fallback against the resolved fragment: the server content stayed
 * unclaimed and a second copy was client-rendered once the yield landed.
 *
 * Replays the chunk artifacts test/server/live-takeover-3764.spec.tsx writes,
 * with the live source's first yield held behind a gate: shell, hydrate, the
 * late chunk (the answer lands, the takeover connects, the boundary resumes
 * against the fragment), then the yield.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { flush } from "solid-js";
import { hydrate } from "@solidjs/web";
import { control, variants } from "../harness/live-takeover-3764.jsx";

const artifactsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../harness/__artifacts__");

function loadArtifact(name: string): { shell: string; rest: string } {
  const file = resolve(artifactsDir, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `Missing artifact "${name}". Run the server spec first: ` +
        `vitest run --config vite.config.server.mjs test/server/live-takeover-3764.spec.tsx`
    );
  }
  return JSON.parse(readFileSync(file, "utf-8"));
}

function applyChunk(container: HTMLElement, chunk: string, first: boolean) {
  const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
  const scripts = [...chunk.matchAll(scriptRe)].map(m => m[1]);
  const stripped = chunk.replace(scriptRe, "");
  if (first) container.innerHTML = stripped;
  else container.insertAdjacentHTML("beforeend", stripped);
  for (const s of scripts) (0, eval)(s);
}

function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(r => (release = r));
  return { promise, release };
}

async function drain() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  flush();
  for (let i = 0; i < 40; i++) await Promise.resolve();
  flush();
}

const originalControl = { ...control };

afterEach(() => {
  Object.assign(control, originalControl);
});

describe("live source takeover vs streamed <Loading> claim (#3764)", () => {
  for (const variant of variants) {
    test(variant.name, async () => {
      const { shell, rest } = loadArtifact(variant.name);
      const gate = deferred<{ id: number }[]>();
      let connects = 0;
      control.first = () => gate.promise;
      control.onConnect = () => connects++;

      (globalThis as any)._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} };
      const container = document.createElement("div");
      document.body.appendChild(container);
      const warnings: string[] = [];
      const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      });
      const text = () => container.querySelector("section")!.textContent;

      let dispose: (() => void) | undefined;
      try {
        applyChunk(container, shell, true);
        dispose = hydrate(() => <variant.App />, container);
        flush();
        await drain();
        // The shell hydrated while the node's answer still streams: nothing
        // to take over from yet, so the source stays unconnected and the
        // boundary shows its fallback.
        expect(text()).toBe("loading");
        expect(connects).toBe(0);

        // The late chunk: the answer resolves, the fragment swaps in, the
        // boundary's record settles.
        applyChunk(container, rest, false);
        const serverList = container.querySelector("ul")!;
        expect(serverList).not.toBeNull();
        await drain();
        await new Promise(r => setTimeout(r, 10));

        // The boundary resumed against the fragment: it claimed the server
        // list (same node, not re-created) and shows the adopted value. The
        // takeover connected from that value; its first yield is in flight.
        expect(warnings).toEqual([]);
        expect(text()).toBe(variant.content);
        expect(container.querySelectorAll("ul").length).toBe(1);
        expect(container.querySelector("ul")).toBe(serverList);
        expect(connects).toBe(1);

        // The first live yield updates the claimed DOM in place.
        gate.release([{ id: 1 }, { id: 2 }, { id: 3 }]);
        await drain();
        expect(text()).toBe(variant.next);
        expect(container.querySelectorAll("ul").length).toBe(1);
        expect(container.querySelector("ul")).toBe(serverList);
        expect(connects).toBe(1);
        expect(warnings).toEqual([]);
      } finally {
        warn.mockRestore();
        dispose?.();
        await new Promise(r => setTimeout(r, 0));
        container.remove();
      }
    });
  }
});
