import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import {
  ExactWebpackPlugin,
  applyExactWebpackResolver,
  addWebpackConditions,
  createExactWebpackRule,
  resolveExactWebpackRequest,
  transformExactWebpackSource,
  type WebpackCompilerLike
} from "./index.js";
import { webpackCompilerSessionCount } from "./sessions.js";

describe("@exact/webpack-plugin", () => {
  it("transforms matching TSX sources through the shared compiler", () => {
    const result = transformExactWebpackSource("const view = <span />;", "/src/view.tsx");

    expect(result?.code).toContain("__exactVNode(\"span\"");
    expect(result?.map).toMatchObject({
      version: 3,
      sources: ["/src/view.tsx"],
      sourcesContent: ["const view = <span />;"]
    });
  });

  it("passes target options through to transforms", () => {
    const result = transformExactWebpackSource(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `, "/src/page.tsx", { target: "client" });

    expect(result?.code).not.toContain("node:fs/promises");
  });

  it("passes imported manifests through to transforms", () => {
    const manifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const result = transformExactWebpackSource(`
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
    const root = mkdtempSync(path.join(tmpdir(), "exact-webpack-manifest-files-"));
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
    expect(transformExactWebpackSource(source, "/src/Page.tsx", { target: "server", manifestFiles: [manifestFile] })?.code).not.toContain("__exactBoundary");

    writeFileSync(manifestFile, JSON.stringify(second));
    expect(transformExactWebpackSource(source, "/src/Page.tsx", { target: "server", manifestFiles: [manifestFile] })?.code).toContain("__exactBoundary");
  });

  it("rejects malformed manifest files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "exact-webpack-bad-manifest-"));
    const manifestFile = path.join(root, "bad.exact.manifest.json");
    writeFileSync(manifestFile, JSON.stringify({ version: 1, filename: "bad.tsx" }));

    expect(() => transformExactWebpackSource("const view = <span />;", "/src/view.tsx", {
      manifestFiles: [manifestFile]
    })).toThrow("Malformed eXact compiler manifest");
  });

  it("resolves exact facade imports through shared artifact resolution", () => {
    expect(resolveExactWebpackRequest("./Panel.exact", "/app/src/main.ts", { target: "server" })).toBe(path.resolve("/app/src/Panel.exact.server.ts"));
    expect(resolveExactWebpackRequest("./Panel", "/app/src/main.ts")).toBeNull();
  });

  it("adds export conditions without duplicating existing conditions", () => {
    const compiler: WebpackCompilerLike = { options: { resolve: { conditionNames: ["browser", "exact-client"] } } };

    addWebpackConditions(compiler, ["exact-client"]);

    expect(compiler.options.resolve?.conditionNames).toEqual(["exact-client", "browser"]);
  });

  it("creates a pre-loader rule", () => {
    expect(createExactWebpackRule({ target: "server" })).toMatchObject({
      enforce: "pre",
      use: [{ loader: "@exact/webpack-plugin/loader", options: { target: "server" } }]
    });
  });

  it("adds filename context to transform errors", () => {
    expect(() => transformExactWebpackSource("const view = <span>;", "/src/broken.tsx")).toThrow(/eXact JSX transform failed for \/src\/broken\.tsx/);
  });

  it("applies conditions and loader rules to a compiler", () => {
    let resolverFactory: ((resolver: any) => any) | undefined;
    let watchRun!: (compiler: WebpackCompilerLike & { modifiedFiles?: Iterable<string>; removedFiles?: Iterable<string> }) => void;
    const compiler: WebpackCompilerLike = { options: {} };
    compiler.hooks = {
      watchRun: {
        tap(_name, handler) { watchRun = handler; }
      },
      normalModuleFactory: {
        tap(_name, handler) {
          handler({
            hooks: {
              resolver: {
                tap(_pluginName, factory) {
                  resolverFactory = factory;
                }
              }
            }
          });
        }
      }
    };

    new ExactWebpackPlugin({ target: "server" }).apply(compiler);

    expect(compiler.options.resolve?.conditionNames).toEqual(["exact-server"]);
    expect(compiler.options.module?.rules).toHaveLength(1);
    expect(resolverFactory).toBeTypeOf("function");
    expect(() => watchRun({
      options: compiler.options,
      modifiedFiles: ["/project/src/model.ts"],
      removedFiles: ["/project/src/removed.ts"]
    })).not.toThrow();
    expect(() => watchRun({
      options: compiler.options,
      modifiedFiles: ["/project/tsconfig.json"]
    })).not.toThrow();
  });

  it("owns, deduplicates, and releases diagnostics by default in watch mode", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const model = path.join(root, "apps/kanban/src/__webpack_diagnostic_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__webpack_diagnostic_consumer.ts");
    const warnings: string[] = [];
    let watchRun!: (compiler: WebpackCompilerLike & { modifiedFiles?: Iterable<string> }) => void;
    let shutdown!: () => void;
    const compiler: WebpackCompilerLike = {
      options: {},
      hooks: {
        watchRun: { tap(_name, handler) { watchRun = handler; } },
        shutdown: { tap(_name, handler) { shutdown = handler; } }
      },
      getInfrastructureLogger: () => ({ warn: message => warnings.push(message) })
    };
    const before = webpackCompilerSessionCount();
    try {
      writeFileSync(model, "export interface Model { value: number }\nexport const model: Model = { value: 1 };");
      writeFileSync(consumer, 'import { model } from "./__webpack_diagnostic_model.js"; export const value: number = model.value;');
      new ExactWebpackPlugin().apply(compiler);
      expect(webpackCompilerSessionCount()).toBe(before + 1);
      watchRun({ options: compiler.options, modifiedFiles: [model] });
      writeFileSync(model, 'export interface Model { value: string }\nexport const model: Model = { value: "changed" };');
      watchRun({ options: compiler.options, modifiedFiles: [model] });
      watchRun({ options: compiler.options, modifiedFiles: [model] });
      expect(warnings.filter(message => message.includes("TS2322"))).toHaveLength(1);
      shutdown();
      expect(webpackCompilerSessionCount()).toBe(before);
    } finally {
      if (webpackCompilerSessionCount() > before) shutdown?.();
      rmSync(model, { force: true });
      rmSync(consumer, { force: true });
    }
  });

  it("installs React aliases and compiles inferred React JSX to the compatibility runtime", () => {
    const compiler: WebpackCompilerLike = { options: {} };
    new ExactWebpackPlugin({ reactCompatibility: { target: 19 } }).apply(compiler);
    expect(compiler.options.resolve?.alias).toMatchObject({
      "react$": "@exact/react-compat/react19",
      "react/jsx-runtime$": "@exact/react-compat/jsx-runtime19",
      "react-dom/client$": "@exact/react-dom-compat/client19"
    });
    expect(transformExactWebpackSource(
      "/** @jsxImportSource react */\nconst view = <span />;",
      "/src/view.tsx",
      { reactCompatibility: { target: 19 } }
    )?.code).toContain("@exact/react-compat/jsx-runtime19");
    expect(transformExactWebpackSource(
      'import * as React from "react"; const view = <span>{React.version}</span>;',
      "/src/inferred.tsx",
      { reactCompatibility: { target: 19 } }
    )?.code).toContain("@exact/react-compat/jsx-runtime19");
  });

  it("rewrites exact facade requests through Webpack resolver hooks", () => {
    let handler!: (request: { request?: string; path?: string }, context: unknown, callback: (error?: Error | null, result?: unknown) => void) => void;
    const resolver = applyExactWebpackResolver({
      hooks: {
        resolve: {
          tapAsync(_name, next) {
            handler = next;
          }
        }
      }
    }, { target: "server" });

    expect(resolver).toBeDefined();

    let result: unknown;
    handler({ request: "./Panel.exact", path: "/app/src" }, {}, (_error, value) => {
      result = value;
    });

    expect(result).toMatchObject({
      request: path.resolve("/app/src/Panel.exact.server.ts")
    });
  });

  it("rejects a mismatched reconciler relative to the importing project", () => {
    let handler!: (request: { request?: string; path?: string }, context: unknown, callback: (error?: Error | null) => void) => void;
    applyExactWebpackResolver({
      hooks: { resolve: { tapAsync(_name, next) { handler = next; } } }
    }, { reactCompatibility: { target: 19 } });
    let error: Error | null | undefined;
    handler({
      request: "react-reconciler",
      path: path.resolve(import.meta.dirname, "../../../apps/react-reconciler-reference-18")
    }, {}, nextError => { error = nextError; });
    expect(error?.message).toMatch(/target 19.*react-reconciler 0\.29\.2/);
  });
});
