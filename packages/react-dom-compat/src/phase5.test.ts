import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { Suspense, cache, cacheSignal, createElement } from "@exact/react-compat";
import { renderToPipeableStream, renderToReadableStream, renderToStaticMarkup, renderToString } from "./server-node.js";
import { prerender, prerenderToNodeStream } from "./static-node.js";

async function webText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

async function nodeText(stream: NodeJS.ReadableStream): Promise<string> {
  let value = "";
  for await (const chunk of stream) value += String(chunk);
  return value;
}

describe("React compatibility server rendering", () => {
  it("matches common React string markup conventions", () => {
    const tree = createElement("label", {
      htmlFor: "field",
      tabIndex: 0,
      disabled: true,
      spellCheck: false,
      style: { backgroundColor: "red", lineHeight: 2, marginTop: 4 }
    }, "first", "second");
    const html = '<label for="field" tabindex="0" disabled="" spellCheck="false" style="background-color:red;line-height:2;margin-top:4px">first<!-- -->second</label>';
    expect(renderToString(tree)).toBe(html);
    expect(renderToStaticMarkup(tree)).toBe(html.replace("<!-- -->", ""));
  });

  it("renders Suspense fallbacks during synchronous string rendering", () => {
    function Pending(): never { throw new Promise(() => {}); }
    expect(renderToString(createElement(Suspense, { fallback: createElement("i", null, "loading") }, createElement(Pending, null))))
      .toBe("<i>loading</i>");
  });

  it("scopes React cache entries and cache signals to one server request", () => {
    let calls = 0;
    let signal: AbortSignal | undefined;
    const read = cache((key: string) => `${key}:${++calls}`);
    function Value() {
      signal = cacheSignal();
      return createElement("span", null, read("shared"));
    }
    expect(renderToString(createElement("div", null, createElement(Value), createElement(Value))))
      .toBe("<div><span>shared:1</span><span>shared:1</span></div>");
    expect(signal?.aborted).toBe(true);
    expect(renderToString(createElement(Value))).toBe("<span>shared:2</span>");
  });

  it("provides all-ready Web, Node, pipeable, and prerender streams", async () => {
    const tree = createElement("main", null, "ready");
    const readable = await renderToReadableStream(tree);
    await readable.allReady;
    expect(await webText(readable)).toBe("<main>ready</main>");

    const allReady = vi.fn();
    const destination = new PassThrough();
    const output = nodeText(destination);
    renderToPipeableStream(tree, { onAllReady: allReady }).pipe(destination);
    expect(await output).toBe("<main>ready</main>");
    expect(allReady).toHaveBeenCalledTimes(1);

    expect(await webText((await prerender(tree)).prelude)).toBe("<main>ready</main>");
    expect(await nodeText((await prerenderToNodeStream(tree)).prelude)).toBe("<main>ready</main>");
  });
});
