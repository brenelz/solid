/**
 * @jsxImportSource @solidjs/web
 *
 * #3973 — an async read that rejects under `<Errored>` is contained (the
 * fallback renders), but when the boundary shares a `{props.children}` slot
 * with an async sibling the rejection also escapes as an
 * `unhandledRejection`, which exits Node. Each test owns the process's
 * `unhandledRejection` listeners for its duration so a leak fails THIS test.
 */
import { describe, expect, test } from "vitest";
import { renderToStream, Errored, Loading } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function watchRejections<T>(run: () => Promise<T> | T) {
  const previous = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  const escaped: unknown[] = [];
  const capture = (reason: unknown) => escaped.push(reason);
  process.on("unhandledRejection", capture);
  try {
    const value = await run();
    for (let turn = 0; turn < 4; turn++) await delay(20);
    return { escaped, value };
  } finally {
    process.off("unhandledRejection", capture);
    for (const listener of previous) process.on("unhandledRejection", listener as any);
  }
}

const messages = (escaped: unknown[]) => escaped.map(e => (e as Error).message);
const stripScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "");

function Layout(props: { children: any }) {
  return <main>{props.children}</main>;
}

function Fails() {
  const value = createMemo(async () => {
    await delay(5);
    throw new Error("boom");
  });
  return <p>{value()}</p>;
}

function Later() {
  const value = createMemo(async () => {
    await delay(20);
    return "later";
  });
  return <p>{value()}</p>;
}

describe("#3973 renderToStream: a rejection contained by <Errored> beside an async sibling", () => {
  test("in a shared children slot, the fallback renders and nothing leaks", async () => {
    const { escaped, value } = await watchRejections(() =>
      renderToStream(() => (
        <Loading fallback={<p>loading</p>}>
          <Layout>
            <Errored fallback={() => <p>failed</p>}>
              <Fails />
            </Errored>
            <Later />
          </Layout>
        </Loading>
      ))
    );
    expect(stripScripts(value)).toContain(">failed<");
    expect(stripScripts(value)).toContain(">later<");
    expect(messages(escaped)).toEqual([]);
  });

  test("wrapped in an outer <Errored>, the inner boundary still contains it and nothing leaks", async () => {
    const { escaped, value } = await watchRejections(() =>
      renderToStream(() => (
        <Errored fallback={() => <p>outer</p>}>
          <Loading fallback={<p>loading</p>}>
            <Layout>
              <Errored fallback={() => <p>failed</p>}>
                <Fails />
              </Errored>
              <Later />
            </Layout>
          </Loading>
        </Errored>
      ))
    );
    expect(stripScripts(value)).toContain(">failed<");
    expect(stripScripts(value)).toContain(">later<");
    expect(stripScripts(value)).not.toContain(">outer<");
    expect(messages(escaped)).toEqual([]);
  });
});
