import { describe, expect, it } from "vitest";
import { createNodeRequestScope } from "./node.js";
import { createComponentInstance, type Component } from "@exact/core";
import { createRequestScope, getRequestContext, RequestContext, RequestProvider, runWithRequestContext } from "./index.js";

describe("request context", () => {
  it("restores nested values", () => {
    const scope = createNodeRequestScope();
    const outer = { url: new URL("https://example.test/outer") };
    const inner = { url: new URL("https://example.test/inner") };
    scope.run(outer, () => {
      expect(getRequestContext(scope)?.url.pathname).toBe("/outer");
      scope.run(inner, () => expect(getRequestContext(scope)?.url.pathname).toBe("/inner"));
      expect(getRequestContext(scope)?.url.pathname).toBe("/outer");
    });
    expect(getRequestContext(scope)).toBeUndefined();
  });

  it("keeps concurrent Node scopes isolated", async () => {
    const scope = createNodeRequestScope();
    const read = (path: string) => scope.run({ url: new URL(`https://example.test/${path}`) }, async () => {
      await Promise.resolve();
      return getRequestContext(scope)?.url.pathname;
    });
    expect(await Promise.all([read("a"), read("b")])).toEqual(["/a", "/b"]);
  });

  it("supports the default synchronous scope", () => {
    runWithRequestContext({ url: new URL("https://example.test/default") }, () => {
      expect(getRequestContext()?.url.pathname).toBe("/default");
    });
  });

  it("rejects unsafe asynchronous use of the synchronous default", () => {
    expect(() => runWithRequestContext({ url: new URL("https://example.test/async") }, async () => {
      await Promise.resolve();
    })).toThrow("configure async-safe storage");
  });

  it("creates isolated portable scopes without requiring storage plumbing", () => {
    const first = createRequestScope();
    const second = createRequestScope();
    first.run({ url: new URL("https://example.test/first") }, () => {
      expect(first.current()?.url.pathname).toBe("/first");
      expect(second.current()).toBeUndefined();
    });
  });

  it("publishes explicit request values through the component context", () => {
    const value = { url: new URL("https://example.test/component") };
    const provider = createComponentInstance(RequestProvider, { value });
    function Consumer(this: Component<{}>) { return () => null; }
    const consumer = createComponentInstance(Consumer, {}, provider);
    expect(consumer.getContext(RequestContext).url.pathname).toBe("/component");
  });
});
