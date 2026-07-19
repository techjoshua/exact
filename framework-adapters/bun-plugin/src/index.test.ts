import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  exact,
  mergeConditions,
  resolveExactBunRequest,
  transformExactBunSource,
  type BunLoadArgs,
  type BunLoadResult,
  type BunBuildLike
} from "./index.js";

describe("@exact/bun-plugin", () => {
  it("reports opt-in transform timings", () => {
    const onProfile = vi.fn();

    transformExactBunSource("const view = <span />;", "/src/profiled.tsx", { onProfile });

    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: "bun-plugin",
      phase: "transform"
    }));
  });

  it("transforms matching TSX sources through the shared compiler", () => {
    const result = transformExactBunSource("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
    expect(result?.map).toMatchObject({
      version: 3,
      sources: ["/src/view.tsx"],
      sourcesContent: ["const view = <span />;"]
    });
  });

  it("resolves exact facade imports through shared artifact resolution", () => {
    expect(resolveExactBunRequest("./Panel.exact", "/app/src/main.ts", { target: "server" })).toBe(path.resolve("/app/src/Panel.exact.server.ts"));
    expect(resolveExactBunRequest("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("merges conditions without duplicating existing entries", () => {
    expect(mergeConditions(["browser", "exact-client"], ["exact-client"])).toEqual(["exact-client", "browser"]);
  });

  it("adds filename context to transform errors", () => {
    expect(() => transformExactBunSource("const view = <span>;", "/src/broken.tsx")).toThrow(/eXact JSX transform failed for \/src\/broken\.tsx/);
  });

  it("registers and executes Bun resolve and load hooks", async () => {
    const resolveHooks: Array<{ filter: RegExp; handler: (args: { path: string; importer?: string }) => { path?: string } | Promise<{ path?: string }> }> = [];
    let loadHook!: (args: BunLoadArgs) => BunLoadResult | Promise<BunLoadResult>;
    let startHook!: () => void | Promise<void>;
    const build: BunBuildLike = {
      config: { conditions: ["browser"] },
      onResolve(options, handler) {
        resolveHooks.push({ filter: options.filter, handler });
      },
      onLoad(_options, handler) {
        loadHook = handler;
      },
      onStart(handler) {
        startHook = handler;
      }
    };

    exact({ target: "server" }).setup(build);

    expect(build.config?.conditions).toEqual(["exact-server", "browser"]);
    await expect(Promise.resolve(startHook())).resolves.toBeUndefined();
    const exactResolver = resolveHooks.find(entry => entry.filter.test("./Panel.exact"))!;
    await expect(Promise.resolve(exactResolver.handler({
      path: "./Panel.exact",
      importer: "/app/src/main.ts"
    }))).resolves.toEqual({
      path: path.resolve("/app/src/Panel.exact.server.ts")
    });
    await expect(loadHook({
      path: "/app/src/view.tsx",
      text: async () => "const view = <span />;"
    })).resolves.toMatchObject({
      contents: expect.stringContaining("__exactVNode(\"span\""),
      loader: "tsx",
      sourcemap: {
        version: 3,
        sources: ["/app/src/view.tsx"]
      }
    });
    await expect(loadHook({
      path: "/app/src/model.ts",
      text: async () => "export type Model = { title: string };"
    })).resolves.toEqual({});
  });

  it("surfaces and deduplicates diagnostics by default in watch mode", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const model = path.join(root, "apps/kanban/src/__bun_diagnostic_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__bun_diagnostic_consumer.ts");
    let loadHook!: (args: BunLoadArgs) => BunLoadResult | Promise<BunLoadResult>;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeFileSync(model, "export interface Model { value: number }\nexport const model: Model = { value: 1 };");
      writeFileSync(consumer, 'import { model } from "./__bun_diagnostic_model.js"; export const value: number = model.value;');
      exact().setup({
        config: { watch: true },
        onResolve() {},
        onLoad(_options, handler) { loadHook = handler; }
      });
      await loadHook({ path: model, text: async () => "export interface Model { value: number }\nexport const model: Model = { value: 1 };" });
      const changed = 'export interface Model { value: string }\nexport const model: Model = { value: "changed" };';
      writeFileSync(model, changed);
      await loadHook({ path: model, text: async () => changed });
      await loadHook({ path: model, text: async () => changed });
      expect(warn.mock.calls.filter(call => String(call[0]).includes("TS2322"))).toHaveLength(1);
    } finally {
      warn.mockRestore();
      rmSync(model, { force: true });
      rmSync(consumer, { force: true });
    }
  });

  it("registers React aliases and compiles React JSX to the compatibility runtime", async () => {
    const resolvers: Array<{ filter: RegExp; handler: (args: { path: string; importer?: string }) => { path?: string } | Promise<{ path?: string }> }> = [];
    const build: BunBuildLike = {
      onResolve(options, handler) { resolvers.push({ filter: options.filter, handler }); },
      onLoad() {}
    };
    exact({ reactCompatibility: { target: 18 } }).setup(build);
    const reactResolver = resolvers.find(entry => entry.filter.test("react"))!;
    await expect(Promise.resolve(reactResolver.handler({ path: "react" }))).resolves.toEqual({
      path: "@exact/react-compat/react18"
    });
    expect(transformExactBunSource(
      "/** @jsxImportSource react */\nconst view = <span />;",
      "/src/view.tsx",
      { reactCompatibility: { target: 18 } }
    )?.code).toContain("@exact/react-compat/jsx-runtime18");
    expect(transformExactBunSource(
      'import { useMemo } from "react"; const view = <span>{useMemo(() => 1, [])}</span>;',
      "/src/inferred.tsx",
      { reactCompatibility: { target: 18 } }
    )?.code).toContain("@exact/react-compat/jsx-runtime18");
  });

  it("rejects a mismatched reconciler relative to the importer", async () => {
    const resolvers: Array<{ filter: RegExp; handler: (args: { path: string; importer?: string }) => { path?: string } | Promise<{ path?: string }> }> = [];
    exact({ reactCompatibility: { target: 19 } }).setup({
      onResolve(options, handler) { resolvers.push({ filter: options.filter, handler }); },
      onLoad() {}
    });
    const reconcilerResolver = resolvers.find(entry => entry.filter.test("react-reconciler"))!;
    await expect(Promise.resolve().then(() => reconcilerResolver.handler({
      path: "react-reconciler",
      importer: path.resolve(import.meta.dirname, "../../../apps/react-reconciler-reference-18/src/scenario.mjs")
    }))).rejects.toThrow(/target 19.*react-reconciler 0\.29\.2/);
  });
});
