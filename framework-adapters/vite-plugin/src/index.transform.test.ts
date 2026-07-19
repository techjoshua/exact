import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { exact } from "./index.js";
import { createReactCompatibilityBuildEngine } from "@exact/react-compat/build";

describe("@exact/vite-plugin: transform", () => {
  it("forwards profiling into its compiler session", () => {
    const events: Array<{ subsystem: string; phase: string }> = [];
    const plugin = exact({
      reactCompatibility: false,
      onProfile: event => events.push(event)
    });

    plugin.transform("const view = <span />;", "/src/profiled.tsx");

    expect(events).toContainEqual(expect.objectContaining({
      subsystem: "compiler",
      phase: "expression-module"
    }));
    expect(events).toContainEqual(expect.objectContaining({
      subsystem: "vite-plugin",
      phase: "transform"
    }));
  });

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

  it("runs prepared compiler policies for plain TypeScript modules", () => {
    const plugin = exact({
      reactCompatibility: false,
      pluginRegistry: {
        fingerprint: "test",
        plugins: {
          "@exact/policy": {
            packageName: "@exact/policy",
            version: "1.0.0",
            protocolVersion: "1.0.0",
            required: true,
            cacheKey: 1,
            extension: {
              namespace: "policy",
              directives: ["source"],
              include: /\.ts$/,
              analyzeModule: () => ({
                diagnostics: [{ severity: "error", code: "blocked", message: "plain TS was analyzed" }]
              })
            }
          }
        }
      }
    });
    expect(() => plugin.transform("/** @exact policy.source */\nexport const value = 1;", "/src/value.ts"))
      .toThrow("plain TS was analyzed");
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
});
