import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/query-core";
import { createComponentInstance, type Component } from "@exact/core";
import { flushSync } from "@exact/reactive";
import { createComponentQuery, ExactQueryClientProvider, QueryClientContext } from "./index.js";
import { QueryClientProvider } from "./provider.js";
import { createElement } from "@exact/react-compat";
import { toExactNode } from "@exact/react-compat/exact";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

describe("@exact/tanstack-query", () => {
  it("shares an opaque QueryClient through the native provider", () => {
    const client = new QueryClient();
    const provider = createComponentInstance(ExactQueryClientProvider, { client });
    createComponentInstance(function Child(this: Component<{}>) {
      expect(this.getContext(QueryClientContext)).toBe(client);
      return () => null;
    }, {}, provider);
  });

  it("exports a React replacement that mounts the native provider boundary", () => {
    const client = new QueryClient();
    const vnode = toExactNode(createElement(QueryClientProvider, { client }));
    expect((vnode as { type: unknown }).type).toBe(ExactQueryClientProvider);
  });

  it("bridges QueryObserver updates and owns disposal with the component", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const provider = createComponentInstance(ExactQueryClientProvider, { client });
    let query!: ReturnType<typeof createComponentQuery<number>>;
    const child = createComponentInstance(function Child(this: Component<{}>) {
      query = createComponentQuery(this, { queryKey: ["value"], queryFn: async () => 42 });
      return () => null;
    }, {}, provider);
    await query.observer.refetch();
    flushSync();
    expect(query.result.get().data).toBe(42);
    child.unmount();
    expect(query.external.disposed).toBe(true);
  });

  it("keeps the fully native entry free of React compatibility and React Query", async () => {
    const result = await build({
      stdin: {
        contents: await readFile(new URL("./index.ts", import.meta.url), "utf8"),
        loader: "ts",
        sourcefile: "native-tanstack-query.ts"
      },
      bundle: true,
      external: ["@tanstack/query-core", "@exact/core", "@exact/reactive"],
      write: false,
      metafile: true,
      platform: "browser",
      format: "esm"
    });
    const output = result.outputFiles![0]!.text;
    expect(output).not.toContain("@exact/react-compat");
    expect(output).not.toContain("@tanstack/react-query");
  });
});
