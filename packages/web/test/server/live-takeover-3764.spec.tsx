/**
 * @jsxImportSource @solidjs/web
 *
 * Server half of the #3764 pair (see test/harness/live-takeover-3764.tsx).
 * Renders each variant with renderToStream and writes the chunk artifact
 * test/hydration/live-takeover-3764.spec.tsx replays into jsdom against the
 * dom-generate compilation of the same fixture.
 */
import { describe, expect, test } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStream } from "@solidjs/web";
import { variants } from "../harness/live-takeover-3764.jsx";

const artifactsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../harness/__artifacts__");
mkdirSync(artifactsDir, { recursive: true });

function collectChunks(code: () => any): Promise<{ shell: string; rest: string }> {
  return new Promise(resolvePromise => {
    const chunks: string[] = [];
    let shell = "";
    let shellDone = false;
    renderToStream(code, {
      onCompleteShell() {
        shellDone = true;
      }
    }).pipe({
      write(chunk: string) {
        chunks.push(chunk);
        if (shellDone && !shell) shell = chunks.join("");
      },
      end() {
        const full = chunks.join("");
        if (!shell) shell = full;
        resolvePromise({ shell, rest: full.slice(shell.length) });
      }
    });
  });
}

const visibleText = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "");

describe("live source outside a streamed Loading (#3764) — server render", () => {
  for (const variant of variants) {
    test(`${variant.name}: suspends into the shell, streams the content, writes the artifact`, async () => {
      const { shell, rest } = await collectChunks(() => <variant.App />);

      expect(visibleText(shell)).toBe("loading");
      expect(rest).not.toBe("");
      expect(visibleText(rest)).toBe(variant.content);
      expect(rest).toContain("$df(");

      writeFileSync(
        resolve(artifactsDir, `${variant.name}.json`),
        JSON.stringify({ name: variant.name, shell, rest }, null, 2)
      );
    });
  }
});
