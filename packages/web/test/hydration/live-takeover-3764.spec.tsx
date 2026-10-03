/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
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

describe("live source outside a streamed <Loading>", () => {
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
        expect(text()).toBe("loading");
        expect(connects).toBe(0);

        applyChunk(container, rest, false);
        const serverList = container.querySelector("ul")!;
        expect(serverList).not.toBeNull();
        await drain();
        await new Promise(r => setTimeout(r, 10));

        expect(warnings).toEqual([]);
        expect(text()).toBe(variant.content);
        expect(container.querySelectorAll("ul").length).toBe(1);
        expect(container.querySelector("ul")).toBe(serverList);
        expect(connects).toBe(1);

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
