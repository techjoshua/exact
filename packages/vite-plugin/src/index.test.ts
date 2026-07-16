import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exact } from "./index.js";
import { createReactCompatibilityBuildEngine } from "@exact/react-compat/build";

describe("@exact/vite-plugin", () => {
  it("transforms matching tsx files", () => {
    const plugin = exact({ reactCompatibility: false });
    const result = plugin.transform("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
    expect(result?.map).toMatchObject({
      version: 3,
      sources: ["/src/view.tsx"],
      sourcesContent: ["const view = <span />;"]
    });
  });

  it("passes compiler targets through to transformed files", () => {
    const plugin = exact({ target: "client", reactCompatibility: false });
    const result = plugin.transform(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `, "/src/page.tsx");

    expect(result?.code).not.toContain("node:fs/promises");
    expect(result?.code).not.toContain("readFile");
  });

  it("passes imported manifests through to the compiler", () => {
    const manifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const plugin = exact({ target: "server", importedManifests: [manifest], reactCompatibility: false });
    const result = plugin.transform(`
      import { ClientWidget } from "./ClientWidget";
      export function Page() {
        return () => <ClientWidget />;
      }
    `, "/src/Page.tsx");

    expect(result?.code).toContain("__exactBoundary");
    expect(result?.code).toContain("\"ClientWidget\"");
    expect(result?.code).not.toContain("from \"./ClientWidget\"");
  });

  it("loads fresh manifest files for each transform", () => {
    const root = mkdtempSync(path.join(tmpdir(), "exact-vite-manifest-files-"));
    const manifestFile = path.join(root, "ClientWidget.exact.manifest.json");
    const first = analyzeSource(`
      export function ClientWidget() {
        return () => <p>Server</p>;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const second = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const plugin = exact({ target: "server", manifestFiles: [manifestFile], reactCompatibility: false });
    const source = `
      import { ClientWidget } from "./ClientWidget";
      export function Page() {
        return () => <ClientWidget />;
      }
    `;

    writeFileSync(manifestFile, JSON.stringify(first));
    expect(plugin.transform(source, "/src/Page.tsx")?.code).not.toContain("__exactBoundary");

    writeFileSync(manifestFile, JSON.stringify(second));
    expect(plugin.transform(source, "/src/Page.tsx")?.code).toContain("__exactBoundary");
  });

  it("rejects malformed manifest files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "exact-vite-bad-manifest-"));
    const manifestFile = path.join(root, "bad.exact.manifest.json");
    writeFileSync(manifestFile, JSON.stringify({ version: 2, filename: "bad.tsx" }));
    const plugin = exact({ manifestFiles: [manifestFile], reactCompatibility: false });

    expect(() => plugin.transform("const view = <span />;", "/src/view.tsx")).toThrow("Malformed eXact compiler manifest");
  });

  it("passes server component mode through to client transforms", () => {
    const plugin = exact({ target: "client", serverComponents: true, reactCompatibility: false });
    const result = plugin.transform(`
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("page.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `, "/src/Page.tsx");

    expect(result?.code).toContain("Page_ExactClient_1");
    expect(result?.code).not.toContain("export function Page(");
  });

  it("resolves exact facade imports to target artifacts", () => {
    expect(exact({ target: "client", reactCompatibility: false }).resolveId?.("./Panel.exact", "/app/src/main.ts")).toMatch(/Panel\.exact\.client\.ts$/);
    expect(exact({ target: "server", reactCompatibility: false }).resolveId?.("./Panel.exact", "/app/src/main.ts")).toMatch(/Panel\.exact\.server\.ts$/);
    expect(exact({ reactCompatibility: false }).resolveId?.("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("adds target export conditions for packaged exact artifacts", () => {
    expect(exact({ target: "client", reactCompatibility: false }).config?.()).toEqual({
      resolve: { conditions: ["exact-client"] }
    });
    expect(exact({ target: "server", reactCompatibility: false }).config?.()).toEqual({
      resolve: { conditions: ["exact-server"] }
    });
  });

  it("automatically aliases installed React and compiles React-owned JSX to the compatibility runtime", () => {
    const compatibilityRoot = path.resolve(import.meta.dirname, "../test-fixtures/adapter-app");
    const plugin = exact({ reactCompatibility: { target: 18, source: "/react/", cwd: compatibilityRoot } });
    const config = plugin.config?.();
    expect(config?.resolve.alias).toEqual(expect.arrayContaining([
      expect.objectContaining({ replacement: "@exact/react-compat/react18" }),
      expect.objectContaining({ replacement: "@exact/react-dom-compat/client18" })
    ]));
    expect(plugin.transform("/** @jsxImportSource react */\nconst view = <span />;", "/src/react-view.tsx")?.code)
      .toContain("@exact/react-compat/jsx-runtime18");
    expect(plugin.transform("const view = <span />;", "/src/react/widget.tsx")?.code)
      .toContain("@exact/react-compat/jsx-runtime18");
    expect(exact({ reactCompatibility: { target: 18, cwd: compatibilityRoot } }).config?.().resolve.alias).toEqual(expect.arrayContaining([
      expect.objectContaining({ replacement: "@exact/react-compat/react18" })
    ]));
    expect(exact({ reactCompatibility: { target: 18, cwd: compatibilityRoot } }).transform('import { useState } from "react"; const view = <span>{useState(0)[0]}</span>;', "/src/inferred.tsx")?.code)
      .toContain("@exact/react-compat/jsx-runtime18");
    expect(plugin.transform("const view = <span />;", "/src/exact-view.tsx")).not.toBeNull();
  });

  it("rewrites adapter components in authored and prepackaged React modules", () => {
    const plugin = exact({ reactCompatibility: { target: 18, cwd: path.resolve(import.meta.dirname, "../test-fixtures/adapter-app") } });
    const authored = plugin.transform(`
      /** @jsxImportSource react */
      import { QueryClientProvider, useQuery } from "@tanstack/react-query";
      export const queryHook = useQuery;
      export const view = <QueryClientProvider client={client}><Page /></QueryClientProvider>;
    `, "/src/query.tsx");
    expect(authored?.code).toContain('from "@exact/tanstack-query/react"');
    expect(authored?.code).toContain('useQuery } from "@tanstack/react-query"');

    const packaged = plugin.transform(
      'import { QueryClientProvider } from "@tanstack/react-query"; export { QueryClientProvider };',
      "/project/node_modules/example/index.js"
    );
    expect(packaged?.code).toContain('from "@exact/tanstack-query/react"');
  });

  it("matches the shared engine for prepackaged modules", () => {
    const cwd = path.resolve(import.meta.dirname, "../test-fixtures/adapter-app");
    const source = 'import { QueryClientProvider } from "@tanstack/react-query"; export { QueryClientProvider };';
    const plugin = exact({ reactCompatibility: { target: 18, cwd } });
    const shared = createReactCompatibilityBuildEngine({ target: 18, cwd }).transformModule({
      id: "/node_modules/example/index.js", source, format: "module", target: "client", sourceMap: true
    });
    expect(plugin.transform(source, "/node_modules/example/index.js")).toEqual({ code: shared.code, map: shared.map });
  });

  it("honors explicit eXact ownership and the automatic React opt-out", () => {
    const exactOwned = '/** @jsxImportSource @exact/jsx */\nimport { useState } from "react"; const view = <span>{useState}</span>;';
    expect(exact({ reactCompatibility: false }).transform(exactOwned, "/src/exact.tsx")?.code).toContain("__exactVNode");
    expect(exact({ reactCompatibility: false }).transform(
      '/** @jsxImportSource react */\nconst view = <span />;', "/src/react.tsx"
    )).toBeNull();
  });

  it("rejects mixed JSX ownership in strict React compatibility mode", () => {
    const plugin = exact({ reactCompatibility: { target: 19 } });
    expect(() => plugin.transform("/** @jsxImportSource react */\n/** @jsxImportSource @exact/jsx */\nconst view = <span />;", "/src/mixed.tsx"))
      .toThrow(/Mixed React and eXact JSX/);
  });

  it("honors include and exclude filters", () => {
    expect(exact({ include: "/src/", reactCompatibility: false }).transform("const view = <span />;", "/src/view.tsx")).not.toBeNull();
    expect(exact({ include: "/src/", reactCompatibility: false }).transform("const view = <span />;", "/test/view.tsx")).toBeNull();
    expect(exact({ exclude: /ignored/, reactCompatibility: false }).transform("const view = <span />;", "/src/ignored.tsx")).toBeNull();
  });

  it("skips node_modules unless explicitly included", () => {
    expect(exact({ reactCompatibility: false }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).toBeNull();
    expect(exact({ include: "node_modules/lib", reactCompatibility: false }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).not.toBeNull();
  });

  it("adds filename context to transform errors", () => {
    const plugin = exact({ reactCompatibility: false });

    expect(() => plugin.transform("const view = <span>;", "/src/broken.tsx")).toThrow(/broken\.tsx:1:\d+/);
  });

  it("invalidates semantic state for source and project configuration updates", () => {
    const plugin = exact({ reactCompatibility: false });
    expect(() => plugin.handleHotUpdate?.({ file: "/src/model.ts" })).not.toThrow();
    expect(() => plugin.handleHotUpdate?.({ file: "/project/tsconfig.json" })).not.toThrow();
    expect(() => plugin.watchChange?.("/src/removed.tsx", { event: "delete" })).not.toThrow();
    plugin.closeBundle?.();
  });

  it("disposes its compiler session when the dev server closes", () => {
    const plugin = exact({ reactCompatibility: false });
    let close!: () => void;
    plugin.configureServer?.({
      httpServer: {
        once(event, listener) {
          expect(event).toBe("close");
          close = listener;
        }
      },
      watcher: {
        once(event) {
          expect(event).toBe("close");
        }
      }
    });
    expect(plugin.transform("const view = <span />;", "/src/lifecycle.tsx")).not.toBeNull();
    close();
    expect(() => plugin.transform("const view = <span />;", "/src/lifecycle.tsx")).toThrow("disposed");
  });

  it("disposes its compiler session when a build closes", () => {
    const plugin = exact({ reactCompatibility: false });
    expect(plugin.transform("const view = <span />;", "/src/build.tsx")).not.toBeNull();
    plugin.closeBundle?.();
    expect(() => plugin.transform("const view = <span />;", "/src/build.tsx")).toThrow("disposed");
  });

  it("watches every registry input used by the shared engine", () => {
    const cwd = path.resolve(import.meta.dirname, "../test-fixtures/adapter-app");
    const plugin = exact({ reactCompatibility: { target: 18, cwd } });
    const watched: string[] = [];
    plugin.buildStart?.call({ addWatchFile: file => watched.push(file) });
    expect(watched.some(file => file.endsWith("package-lock.json"))).toBe(true);
    expect(watched.some(file => file.replaceAll("\\", "/").endsWith("@exact/tanstack-query/package.json"))).toBe(true);
  });
});
