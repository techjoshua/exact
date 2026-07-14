import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
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
  it("transforms matching TSX sources through the shared compiler", () => {
    const result = transformExactBunSource("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
    expect(result?.map).toMatchObject({
      version: 3,
      sources: ["/src/view.tsx"],
      sourcesContent: ["const view = <span />;"]
    });
  });

  it("passes imported manifests through to transforms", () => {
    const manifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const result = transformExactBunSource(`
      import { ClientWidget } from "./ClientWidget";
      export function Page() {
        return () => <ClientWidget />;
      }
    `, "/src/Page.tsx", { target: "server", importedManifests: [manifest] });

    expect(result?.code).toContain("__exactBoundary");
    expect(result?.code).toContain("\"ClientWidget\"");
    expect(result?.code).not.toContain("from \"./ClientWidget\"");
  });

  it("loads fresh manifest files for each transform", () => {
    const root = mkdtempSync(path.join(tmpdir(), "exact-bun-manifest-files-"));
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
    const source = `
      import { ClientWidget } from "./ClientWidget";
      export function Page() {
        return () => <ClientWidget />;
      }
    `;

    writeFileSync(manifestFile, JSON.stringify(first));
    expect(transformExactBunSource(source, "/src/Page.tsx", { target: "server", manifestFiles: [manifestFile] })?.code).not.toContain("__exactBoundary");

    writeFileSync(manifestFile, JSON.stringify(second));
    expect(transformExactBunSource(source, "/src/Page.tsx", { target: "server", manifestFiles: [manifestFile] })?.code).toContain("__exactBoundary");
  });

  it("rejects malformed manifest files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "exact-bun-bad-manifest-"));
    const manifestFile = path.join(root, "bad.exact.manifest.json");
    writeFileSync(manifestFile, JSON.stringify({ version: 1, filename: "bad.tsx" }));

    expect(() => transformExactBunSource("const view = <span />;", "/src/view.tsx", {
      manifestFiles: [manifestFile]
    })).toThrow("Malformed eXact compiler manifest");
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
    let resolveHook!: (args: { path: string; importer?: string }) => { path?: string } | Promise<{ path?: string }>;
    let loadHook!: (args: BunLoadArgs) => BunLoadResult | Promise<BunLoadResult>;
    let startHook!: () => void | Promise<void>;
    const build: BunBuildLike = {
      config: { conditions: ["browser"] },
      onResolve(_options, handler) {
        resolveHook = handler;
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
    await expect(Promise.resolve(resolveHook({
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
});
