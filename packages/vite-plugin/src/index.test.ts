import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { exact } from "./index.js";

describe("@exact/vite-plugin", () => {
  it("transforms matching tsx files", () => {
    const plugin = exact();
    const result = plugin.transform("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
  });

  it("passes compiler targets through to transformed files", () => {
    const plugin = exact({ target: "client" });
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
    const plugin = exact({ target: "server", importedManifests: [manifest] });
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
    const plugin = exact({ target: "client", serverComponents: true });
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
    expect(exact({ target: "client" }).resolveId?.("./Panel.exact", "/app/src/main.ts")).toMatch(/Panel\.exact\.client\.ts$/);
    expect(exact({ target: "server" }).resolveId?.("./Panel.exact", "/app/src/main.ts")).toMatch(/Panel\.exact\.server\.ts$/);
    expect(exact().resolveId?.("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("adds target export conditions for packaged exact artifacts", () => {
    expect(exact({ target: "client" }).config?.()).toEqual({
      resolve: { conditions: ["exact-client"] }
    });
    expect(exact({ target: "server" }).config?.()).toEqual({
      resolve: { conditions: ["exact-server"] }
    });
  });

  it("honors include and exclude filters", () => {
    expect(exact({ include: "/src/" }).transform("const view = <span />;", "/src/view.tsx")).not.toBeNull();
    expect(exact({ include: "/src/" }).transform("const view = <span />;", "/test/view.tsx")).toBeNull();
    expect(exact({ exclude: /ignored/ }).transform("const view = <span />;", "/src/ignored.tsx")).toBeNull();
  });

  it("skips node_modules unless explicitly included", () => {
    expect(exact().transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).toBeNull();
    expect(exact({ include: "node_modules/lib" }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).not.toBeNull();
  });

  it("adds filename context to transform errors", () => {
    const plugin = exact();

    expect(() => plugin.transform("const view = <span>;", "/src/broken.tsx")).toThrow(/eXact JSX transform failed for \/src\/broken\.tsx/);
  });
});
