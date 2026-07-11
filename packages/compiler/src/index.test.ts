import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  createClientIslandRegistryEntries,
  createExactArtifactGraph,
  createExactArtifactPlan,
  compileFile,
  compileFileArtifacts,
  compileProject,
  createPackageExportMap,
  createServerPartRegistryEntries,
  diffExactArtifactPlans,
  exactExportConditions,
  generatedComponentName,
  preprocessPropPunning,
  resolveExactArtifactImport,
  transform,
  transformSource
} from "./index.js";

describe("@exact/compiler", () => {
  it("lowers JSX to eXact compiled vnode helpers", () => {
    const output = transform("const view = <button title={label}>Save</button>;");

    expect(output).toContain("createCompiledVNode as __exactVNode");
    expect(output).toContain("createDynamicChild as __exactDynamic");
    expect(output).toContain("__exactVNode(\"button\"");
    expect(output).toContain("title: __exactExpression(() => label)");
    expect(output).toContain("\"Save\"");
  });

  it("returns transform results for generic adapters", () => {
    const result = transformSource("const view = <span />;", { filename: "view.tsx" });

    expect(result.filename).toBe("view.tsx");
    expect(result.map).toBeNull();
    expect(result.code).toContain("__exactVNode(\"span\"");
    expect(result.manifest.filename).toBe("view.tsx");
  });

  it("emits stable exact ids for compiled dom elements", () => {
    const output = transform("const view = <section><Label /><span>Ready</span></section>;", { filename: "view.tsx" });

    expect(output).toMatch(/"data-exact-id": "x[a-z0-9]+"/);
    expect(output.match(/"data-exact-id":/g)).toHaveLength(2);
    expect(output).toContain("__exactVNode(Label, {})");
  });

  it("builds semantic task metadata for server component planning", () => {
    const manifest = analyzeSource(`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project?: string; width?: number }>) {
        this.task(async ({ signal }) => {
          this.state.project = await readFile("project.txt", "utf8");
        });
        this.task(({ signal }) => {
          this.state.width = window.innerWidth;
        });
        this.task(({ signal }) => {
          window.addEventListener("resize", () => {});
        });
        return () => <button onClick={() => save()} ref={this.ref(button)}>{this.state.project}</button>;
      }
    `, { filename: "ProjectPage.tsx" });

    const component = manifest.components[0]!;
    expect(component.name).toBe("ProjectPage");
    expect(component.exported).toBe(true);
    expect(component.placement).toBe("isomorphic");
    expect(manifest.exports).toContainEqual({
      name: "ProjectPage",
      kind: "component",
      placement: "isomorphic"
    });
    expect(manifest.symbols).toEqual(expect.arrayContaining([expect.objectContaining({
      id: expect.stringMatching(/^x/),
      componentId: component.id,
      exportName: "ProjectPage",
      localName: "ProjectPage",
      generatedName: "ProjectPage",
      debugName: "ProjectPage",
      kind: "component",
      role: "root",
      target: "both",
      placement: "isomorphic"
    }), expect.objectContaining({
      componentId: component.id,
      exportName: "ProjectPage_ExactServer_1",
      localName: "ProjectPage",
      generatedName: "ProjectPage_ExactServer_1",
      role: "server-part",
      target: "server",
      placement: "isomorphic"
    }), expect.objectContaining({
      componentId: component.id,
      exportName: "ProjectPage_ExactClient_1",
      localName: "ProjectPage_ExactClient_1",
      generatedName: "ProjectPage_ExactClient_1",
      role: "client-island",
      target: "client",
      placement: "client"
    })]));
    expect(component.splitBoundaries).toEqual(expect.arrayContaining(["browser:window", "event-handler", "ref", "server-import:readFile"]));
    expect(component.tasks.map(task => task.placement)).toEqual(["server", "client", "client"]);
    expect(component.tasks[0]!.writes).toContainEqual({
      path: "project",
      kind: "write",
      confidence: "exact"
    });
    expect(component.tasks[0]!.reads).toEqual([]);
    expect(Object.values(manifest.serverActions)[0]!.stateContract).toMatchObject({
      reads: [],
      writes: [{ path: "project", kind: "write", confidence: "exact" }]
    });
    expect(component.tasks[1]!.diagnostics).toContain("task writes component state and references browser-only globals; classify as client and split at this boundary");
    expect(Object.keys(manifest.serverActions)).toEqual([component.tasks[0]!.id]);
  });

  it("emits target-specific client and server task artifacts", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project?: string; width?: number }>) {
        this.task(async ({ signal }) => {
          this.state.project = await readFile("project.txt", "utf8");
        });
        this.task(({ signal }) => {
          this.state.width = window.innerWidth;
        });
        return () => <button onClick={() => this.state.width++}>{this.state.project}</button>;
      }
    `;

    const client = transform(source, { filename: "ProjectPage.tsx", target: "client" });
    const server = transform(source, { filename: "ProjectPage.tsx", target: "server" });

    expect(client).not.toContain("node:fs/promises");
    expect(client).not.toContain("readFile");
    expect(client).toContain("window.innerWidth");
    expect(server).toContain("node:fs/promises");
    expect(server).toContain("readFile");
    expect(server).not.toContain("window.innerWidth");
    expect(server).toContain("export { ProjectPage as ProjectPage_ExactServer_1 };");
  });

  it("honors explicit task placement aliases as compiler escape hatches", () => {
    const source = `
      function Page(this: Component<{ title?: string; width?: number }>) {
        this.task.server(() => {
          this.state.title = "server";
        });
        this.task.client(this.state.width, width => {
          this.state.width = 1;
        });
        return () => <p>{this.state.title}</p>;
      }
    `;

    const manifest = analyzeSource(source, { filename: "Page.tsx" });
    const client = transform(source, { filename: "Page.tsx", target: "client" });
    const server = transform(source, { filename: "Page.tsx", target: "server" });

    expect(manifest.components[0]!.tasks.map(task => task.placement)).toEqual(["server", "client"]);
    expect(manifest.components[0]!.tasks.map(task => task.requestedPlacement)).toEqual(["server", "client"]);
    expect(manifest.components[0]!.tasks[0]!.diagnostics).toContain("task placement forced by this.task.server()");
    expect(client).not.toContain("server");
    expect(client).toContain("width = 1");
    expect(client).toContain("this.task.client(this.reactive(() => this.state.width)");
    expect(server).toContain("server");
    expect(server).not.toContain("width = 1");
  });

  it("fails compilation when explicit task placement contradicts detected environment usage", () => {
    expect(() => transform(`
      function Page(this: Component<{}>) {
        this.task.server(() => {
          window.addEventListener("resize", () => {});
        });
        return () => <p />;
      }
    `)).toThrow("this.task.server() cannot reference browser-only globals");

    expect(() => transform(`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{}>) {
        this.task.client(async () => {
          await readFile("title.txt", "utf8");
        });
        return () => <p />;
      }
    `)).toThrow("this.task.client() cannot reference server-only imports");
  });

  it("lowers shorthand and underscore fragments", () => {
    const output = transform("const view = <_ key={id}><span /></_>; const next = <>tail</>;");

    expect(output).toContain("__exactFragment({ key: id }");
    expect(output).toContain("__exactVNode(\"span\"");
    expect(output).toContain("__exactFragment({}");
  });

  it("lowers expression children to dynamic child boundaries", () => {
    const output = transform("const view = <section>{show ? <span>A</span> : <strong>B</strong>}</section>;");

    expect(output).toContain("__exactDynamic(() => show ? __exactVNode(\"span\"");
    expect(output).toContain(": __exactVNode(\"strong\"");
  });

  it("preserves event handlers as direct functions", () => {
    const output = transform("const view = <button onClick={() => save()} disabled={disabled} />;");

    expect(output).toContain("onClick: () => save()");
    expect(output).toContain("disabled: __exactExpression(() => disabled)");
  });

  it("preserves ref bindings as direct values", () => {
    const output = transform("const view = <button ref={this.ref(button)} title={title} />;");

    expect(output).toContain("ref: this.ref(button)");
    expect(output).toContain("title: __exactExpression(() => title)");
    expect(output).not.toContain("ref: __exactExpression");
  });

  it("preserves spread prop ordering around compiled reactive props", () => {
    const output = transform("const view = <Panel id=\"fixed\" {...shared} title={title} {...extra} />;");

    expect(output).toContain("id: \"fixed\", ...shared, title: __exactExpression(() => title), ...extra");
  });

  it("quotes non-identifier JSX prop names", () => {
    const output = transform("const view = <div data-task-id={task.id} aria-label=\"Task\" />;");

    expect(output).toContain("\"data-task-id\": __exactExpression(() => task.id)");
    expect(output).toContain("\"aria-label\": \"Task\"");
  });

  it("captures this.reactive value arguments as expressions", () => {
    const output = transform("function View() { const query = this.reactive(this.state.query); }");

    expect(output).toContain("this.reactive(() => this.state.query)");
  });

  it("captures this.reactive tagged templates as expressions", () => {
    const output = transform("function View() { const name = this.reactive`${this.state.first} ${this.state.last}`; }");

    expect(output).toContain("this.reactive(() => `${this.state.first} ${this.state.last}`)");
  });

  it("captures this.task dependency arguments as component reactive values", () => {
    const output = transform("function View() { this.task(this.state.query, this.state.page, async (query, page) => {}); }");

    expect(output).toContain("this.task(this.reactive(() => this.state.query), this.reactive(() => this.state.page), async (query, page) => { });");
  });

  it("adds stable compiler ids to this.map list boundaries", () => {
    const output = transform(`
      function View(this: Component<{}>) {
        return () => this.map(items, item => item.id, item => <li>{item.title}</li>);
      }
    `, { filename: "View.tsx" });

    expect(output).toMatch(/this\.map\(items, item => item\.id, item => __exactVNode\("li", \{ "data-exact-id": "x[a-z0-9]+" \}, __exactDynamic\(\(\) => item\.title\)\), "x[a-z0-9]+"\)/);
  });

  it("does not recapture existing reactive lambdas or run-once tasks", () => {
    const output = transform("function View() { this.reactive(() => this.state.query); this.task(({ signal }) => {}); }");

    expect(output).toContain("this.reactive(() => this.state.query)");
    expect(output).toContain("this.task(({ signal }) => { });");
    expect(output).not.toContain("this.reactive(() => () => this.state.query)");
  });

  it("preprocesses Svelte-like prop punning", () => {
    expect(preprocessPropPunning("<UserCard {user} {selected} />")).toBe("<UserCard user={user} selected={selected} />");
  });

  it("does not preprocess puns inside strings or comments", () => {
    const source = [
      "const text = \"<UserCard {user} />\";",
      "// <UserCard {commented} />",
      "const view = <UserCard {user} label=\"{raw}\" />;"
    ].join("\n");

    expect(preprocessPropPunning(source)).toContain("\"<UserCard {user} />\"");
    expect(preprocessPropPunning(source)).toContain("// <UserCard {commented} />");
    expect(preprocessPropPunning(source)).toContain("<UserCard user={user} label=\"{raw}\" />");
  });

  it("preserves directive prologues before helper imports", () => {
    const output = transform("\"use client\";\nconst view = <span />;");

    expect(output.trimStart().startsWith("\"use client\";")).toBe(true);
    expect(output.indexOf("\"use client\";")).toBeLessThan(output.indexOf("import {"));
  });

  it("avoids helper alias collisions with user identifiers", () => {
    const output = transform("const __exactVNode = 1; const view = <span />;");

    expect(output).toContain("createCompiledVNode as __exactVNode_1");
    expect(output).toContain("__exactVNode_1(\"span\"");
    expect(output).toContain("const __exactVNode = 1");
  });

  it("compiles a single TSX file to an output directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-compiler-"));
    const input = path.join(root, "src", "view.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "const view = <span />;");

    const result = await compileFile(input, { outDir, rootDir: path.join(root, "src") });
    const output = await readFile(result.outputFile!, "utf8");

    expect(result.outputFile).toBe(path.join(outDir, "view.ts"));
    expect(output).toContain("__exactVNode(\"span\"");
  });

  it("can emit compiler manifests beside compiled files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-manifest-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `);

    const result = await compileFile(input, {
      outDir,
      rootDir: path.join(root, "src"),
      target: "server",
      emitManifest: true
    });
    const manifest = JSON.parse(await readFile(result.manifestFile!, "utf8"));

    expect(result.manifestFile).toBe(path.join(outDir, "page.exact.json"));
    expect(Object.keys(manifest.serverActions)).toHaveLength(1);
    expect(manifest.components[0].name).toBe("Page");
  });

  it("emits paired client/server artifacts and a manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifacts-"));
    const input = path.join(root, "src", "components", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ title?: string; width?: number }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        this.task.client(() => {
          this.state.width = window.innerWidth;
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const client = await readFile(result.clientFile, "utf8");
    const server = await readFile(result.serverFile, "utf8");
    const manifest = JSON.parse(await readFile(result.manifestFile, "utf8"));

    expect(result.clientFile).toBe(path.join(outDir, "components", "page.exact.client.ts"));
    expect(result.serverFile).toBe(path.join(outDir, "components", "page.exact.server.ts"));
    expect(result.manifestFile).toBe(path.join(outDir, "components", "page.exact.manifest.json"));
    expect(client).not.toContain("node:fs/promises");
    expect(client).toContain("window.innerWidth");
    expect(client).toContain("export function Page");
    expect(server).toContain("node:fs/promises");
    expect(server).not.toContain("window.innerWidth");
    expect(server).toContain("export function Page");
    expect(Object.keys(manifest.serverActions)).toHaveLength(1);
    expect(manifest.exports).toEqual([{ name: "Page", kind: "component", placement: "isomorphic" }]);
    expect(manifest.artifacts).toEqual({
      source: "../../src/components/page.tsx",
      client: "page.exact.client.ts",
      server: "page.exact.server.ts",
      manifest: "page.exact.manifest.json",
      exports: [{ name: "Page", kind: "component", placement: "isomorphic" }],
      symbols: [expect.objectContaining({
        exportName: "Page",
        localName: "Page",
        generatedName: "Page",
        role: "root",
        target: "both"
      })],
      boundaries: []
    });
  });

  it("creates package export maps for generated target artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-package-"));
    const input = path.join(root, "src", "components", "page.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, "export function Page() { return () => <p />; }");

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });

    expect(createPackageExportMap([result], {
      packageRoot: root,
      sourceRoot: path.join(root, "src")
    })).toEqual({
      "./components/page": {
        "exact-client": "./dist/components/page.exact.client.ts",
        "exact-server": "./dist/components/page.exact.server.ts",
        default: "./dist/components/page.exact.client.ts"
      }
    });
  });

  it("resolves exact artifact facade imports without bundler-specific code", () => {
    expect(exactExportConditions("client")).toEqual(["exact-client"]);
    expect(exactExportConditions("server", { serverCondition: "react-server" })).toEqual(["react-server"]);
    expect(resolveExactArtifactImport("./Panel.exact", "/app/src/main.ts", "client")).toEqual({
      id: path.resolve("/app/src/Panel.exact.client.ts"),
      target: "client"
    });
    expect(resolveExactArtifactImport("./Panel", "/app/src/main.ts", "client")).toBeNull();
  });

  it("creates bundler-neutral exact artifact graphs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-graph-"));
    const input = path.join(root, "src", "panel.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const graph = createExactArtifactGraph([result], {
      packageRoot: root,
      sourceRoot: path.join(root, "src")
    });

    expect(graph.conditions).toEqual({
      client: ["exact-client"],
      server: ["exact-server"]
    });
    expect(graph.packageExports["./panel"]).toEqual({
      "exact-client": "./dist/panel.exact.client.ts",
      "exact-server": "./dist/panel.exact.server.ts",
      default: "./dist/panel.exact.client.ts"
    });
    expect(graph.clientIslands).toEqual([expect.objectContaining({
      name: "Panel_ExactClient_1",
      exportName: "Panel_ExactClient_1",
      module: "./dist/panel.exact.client.ts"
    })]);
    expect(graph.serverParts).toEqual([expect.objectContaining({
      name: "Panel_ExactServer_1",
      exportName: "Panel_ExactServer_1",
      module: "./dist/panel.exact.server.ts"
    })]);
    expect(graph.artifacts).toEqual([expect.objectContaining({
      inputFile: input,
      clientFile: result.clientFile,
      serverFile: result.serverFile,
      manifestFile: result.manifestFile
    })]);
  });

  it("plans generated artifact paths without compiling", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-plan-"));
    const src = path.join(root, "src");
    const outDir = path.join(root, ".exact");
    await mkdir(path.join(src, "components"), { recursive: true });
    await writeFile(path.join(src, "components", "panel.tsx"), "export function Panel() { return () => <p />; }");
    await writeFile(path.join(src, "skip.ts"), "export const skip = 1;");

    const plan = await createExactArtifactPlan([src], {
      outDir,
      rootDir: src
    });

    expect(plan).toEqual({
      rootDir: src,
      entries: [{
        inputFile: path.join(src, "components", "panel.tsx"),
        clientFile: path.join(outDir, "components", "panel.exact.client.ts"),
        serverFile: path.join(outDir, "components", "panel.exact.server.ts"),
        manifestFile: path.join(outDir, "components", "panel.exact.manifest.json")
      }]
    });
  });

  it("diffs exact artifact plans for dev-server orchestration", () => {
    const previous = {
      rootDir: "/app/src",
      entries: [
        planEntry("/app/src/a.tsx"),
        planEntry("/app/src/removed.tsx")
      ]
    };
    const next = {
      rootDir: "/app/src",
      entries: [
        planEntry("/app/src/a.tsx"),
        planEntry("/app/src/added.tsx")
      ]
    };

    expect(diffExactArtifactPlans(previous, next)).toEqual({
      added: [planEntry("/app/src/added.tsx")],
      removed: [planEntry("/app/src/removed.tsx")],
      changed: [],
      retained: [planEntry("/app/src/a.tsx")]
    });

    expect(diffExactArtifactPlans(previous, next, {
      changedInputs: ["/app/src/a.tsx"]
    })).toEqual({
      added: [planEntry("/app/src/added.tsx")],
      removed: [planEntry("/app/src/removed.tsx")],
      changed: [planEntry("/app/src/a.tsx")],
      retained: []
    });
  });

  it("creates client island registry entries for generated client artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-island-registry-"));
    const input = path.join(root, "src", "panel.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });

    expect(createClientIslandRegistryEntries([result], {
      rootDir: root
    })).toEqual([{
      id: expect.any(String),
      name: "Panel_ExactClient_1",
      exportName: "Panel_ExactClient_1",
      module: "./dist/panel.exact.client.ts",
      componentId: result.manifest.components[0]!.id
    }]);
  });

  it("creates server part registry entries for generated server artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-server-part-registry-"));
    const input = path.join(root, "src", "panel.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });

    expect(createServerPartRegistryEntries([result], {
      rootDir: root
    })).toEqual([{
      id: expect.any(String),
      name: "Panel_ExactServer_1",
      exportName: "Panel_ExactServer_1",
      module: "./dist/panel.exact.server.ts",
      componentId: result.manifest.components[0]!.id
    }]);
  });

  it("emits server boundary stubs for pure client components", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-split-"));
    const input = path.join(root, "src", "panel.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        return () => <section>
          <button className="primary" title={this.state.count} disabled onClick={() => this.state.count++}>{this.state.count}</button>
          <input ref={this.ref(inputRef)} />
        </section>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const client = await readFile(result.clientFile, "utf8");
    const server = await readFile(result.serverFile, "utf8");
    const islands = result.manifest.symbols.filter(symbol => symbol.role === "client-island");

    expect(result.manifest.components[0]!.clientIslandCount).toBe(2);
    expect(islands.map(symbol => symbol.generatedName)).toEqual(["Panel_ExactClient_1", "Panel_ExactClient_2"]);
    expect(islands[0]!).toMatchObject({
      generatedName: "Panel_ExactClient_1",
      localName: "Panel_ExactClient_1",
      exportName: "Panel_ExactClient_1",
      target: "client",
      placement: "client"
    });
    expect(client).toContain("export function Panel");
    expect(client).not.toContain("export function Panel_ExactClient_1");
    expect(client).not.toContain("export function Panel_ExactClient_2");
    expect(server).toContain("createServerBoundary as");
    expect(server).toContain("export function Panel(props = {})");
    expect(server).not.toContain("Panel_ExactServer_1");
    expect(server).toContain("\"Panel\"");
    expect(server).not.toContain("Panel_ExactClient_1");
    expect(server).not.toContain("className: \"primary\"");
    expect(server).not.toContain("title: this.state.count");
    expect(server).not.toContain("onClick");
    expect(result.manifest.boundaries).toContainEqual({
      id: expect.any(String),
      name: "Panel",
      componentId: result.manifest.components[0]!.id,
      kind: "client-island"
    });
    expect(result.manifest.artifacts?.symbols).toEqual(result.manifest.symbols);
  });

  it("infers arbitrary dynamic client island props in isomorphic server artifacts", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button title={label} onClick={() => this.state.count++} />;
      }
    `, { filename: "Panel.tsx", target: "server" });

    expect(output).toContain("title: label");
    expect(output).toContain("\"__exactState\": { count: this.state.count }");
    expect(output).toContain("Panel_ExactClient_1");
    expect(output).not.toContain("onClick");
  });

  it("generates client island components with state bridge initialization", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.count} onClick={() => this.state.count++} />;
      }
    `, { filename: "Panel.tsx", target: "client" });

    expect(output).toContain("export function Panel_ExactClient_1(props = {})");
    expect(output).toContain("Object.assign(this.state, props.__exactState)");
    expect(output).toContain("title: props.title");
    expect(output).toContain("onClick: () => this.state.count++");
    expect(output).not.toContain("export const Panel_ExactClient_1 = Panel");
  });

  it("generates child-bearing client island components with state bridge props", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number; label: string }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.label} onClick={() => this.state.count++}>
          Save {this.state.count}
        </button>;
      }
    `;
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(client).toContain("export function Panel_ExactClient_1(props = {})");
    expect(client).toContain("title: props.title");
    expect(client).toContain("onClick: () => this.state.count++");
    expect(client).toContain("__exactDynamic(() => this.state.count)");
    expect(server).toContain("\"__exactState\": { count: this.state.count, label: this.state.label }");
    expect(server).toContain("title: this.state.label");
    expect(server).not.toContain("onClick");
  });

  it("bridges owner-local captures into generated client islands", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={() => console.log(label)}>
          {label}
        </button>;
      }
    `;
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(server).toContain("\"__exactCapture\": { label: label }");
    expect(client).toContain("console.log(props.__exactCapture.label)");
    expect(client).toContain("__exactDynamic(() => props.__exactCapture.label)");
  });

  it("bridges component-local function captures into generated client islands", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        function save() {
          this.state.count++;
        }
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(server).not.toContain("__exactCapture");
    expect(client).toContain("function save()");
    expect(client).toContain("onClick: () => save()");
  });

  it("clones component-local arrow function captures into generated client islands", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const save = () => this.state.count++;
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(server).not.toContain("__exactCapture");
    expect(client).toContain("const save = () => this.state.count++;");
    expect(client).toContain("onClick: () => save()");
  });

  it("does not generate nested client islands inside an extracted element island", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <button onClick={() => this.state.count++}>Nested</button>
        </section>;
      }
    `;
    const manifest = analyzeSource(source, { filename: "Panel.tsx" });
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(manifest.components[0]!.clientIslandCount).toBe(1);
    expect(client).toContain("export function Panel_ExactClient_1(props = {})");
    expect(client).not.toContain("export function Panel_ExactClient_2");
    expect(server).toContain("Panel_ExactClient_1");
    expect(server).not.toContain("Panel_ExactClient_2");
  });

  it("splits self-closing client components out of server artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-component-split-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}</button>;
      }

      export function Page(this: Component<{ title: string }>) {
        this.state.title = "Ready";
        return () => <section><ClientWidget title={this.state.title} /></section>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const client = await readFile(result.clientFile, "utf8");
    const server = await readFile(result.serverFile, "utf8");

    expect(client).toContain("export function ClientWidget");
    expect(client).toContain("window.innerWidth");
    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).toContain("title: this.state.title");
    expect(server).not.toContain("window.innerWidth");
    expect(server).not.toContain("onClick");
    expect(result.manifest.boundaries).toContainEqual({
      id: expect.any(String),
      name: "ClientWidget",
      componentId: expect.any(String),
      kind: "client-island"
    });
    expect(result.manifest.artifacts?.boundaries).toEqual(result.manifest.boundaries);
  });

  it("emits server-safe boundary stubs for client components", () => {
    const server = transform(`
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}</button>;
      }
    `, { filename: "ClientWidget.tsx", target: "server" });

    expect(server).toContain("export function ClientWidget(props = {})");
    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).not.toContain("window.innerWidth");
    expect(server).not.toContain("onClick");
  });

  it("splits client components with JSX children into server boundary children", () => {
    const server = transform(`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <ClientShell><p>Server child</p></ClientShell>;
      }
    `, { target: "server" });

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientShell\"");
    expect(server).toContain("__exactVNode(\"p\"");
    expect(server).toContain("\"Server child\"");
    expect(server).not.toContain("window.innerWidth");
  });

  it("emits manifest boundaries for refreshable server child slots", () => {
    const manifest = analyzeSource(`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <>
          <ClientShell><p>Server child</p></ClientShell>
          <ClientShell>Text child</ClientShell>
        </>;
      }
    `, { filename: "Page.tsx" });

    const clientBoundary = manifest.boundaries.find(boundary => boundary.name === "ClientShell" && boundary.kind === "client-island");
    expect(clientBoundary).toBeDefined();
    expect(manifest.boundaries).toContainEqual(expect.objectContaining({
      id: `${clientBoundary!.id}:children`,
      name: "ClientShell:children",
      componentId: clientBoundary!.componentId,
      kind: "server-slot"
    }));
    expect(manifest.boundaries.filter(boundary => boundary.kind === "server-slot")).toHaveLength(1);
  });

  it("splits client components with text-only children into serializable island props", () => {
    const server = transform(`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: string }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <ClientShell>Server child</ClientShell>;
      }
    `, { target: "server" });

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("children: \"Server child\"");
    expect(server).not.toContain("window.innerWidth");
  });

  it("splits client components with expression children into serializable island props", () => {
    const server = transform(`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page(this: Component<{ title: string; count: number }>) {
        return () => <ClientShell>Issue {this.state.title} #{this.state.count}</ClientShell>;
      }
    `, { target: "server" });

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("children: [\"Issue\", this.state.title, \"#\", this.state.count]");
    expect(server).not.toContain("window.innerWidth");
  });

  it("fails clearly when a generated client island references server-only imports", () => {
    expect(() => transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          this.state.count = 1;
        });
        return () => <button onClick={() => readFile("secret.txt", "utf8")}>Read</button>;
      }
    `, { filename: "Panel.tsx", target: "server" })).toThrow("client island cannot reference server-only imports");
  });

  it("fails clearly when isomorphic server-rendered code references browser globals outside a client island", () => {
    expect(() => transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{window.innerWidth}</p>;
      }
    `, { filename: "Panel.tsx", target: "server" })).toThrow("browser-only global window cannot be used in server-rendered component code");
  });

  it("allows browser globals in pure client components that become server stubs", () => {
    const server = transform(`
      export function Panel() {
        return () => <p>{window.innerWidth}</p>;
      }
    `, { filename: "Panel.tsx", target: "server" });

    expect(server).toContain("__exactBoundary");
    expect(server).not.toContain("window.innerWidth");
  });

  it("removes imports used only by split client components from server artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-prune-imports-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "out");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { Chart } from "chart-lib";

      export function ClientChart(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => Chart.render()} />;
      }

      export function Page() {
        return () => <ClientChart />;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const client = await readFile(result.clientFile, "utf8");
    const server = await readFile(result.serverFile, "utf8");

    expect(client).toContain("chart-lib");
    expect(server).not.toContain("chart-lib");
    expect(server).not.toContain("Chart.render");
    expect(server).toContain("\"ClientChart\"");
  });

  it("generates deterministic split component names from author names", () => {
    expect(generatedComponentName("ProjectCard", "client-island", 1)).toBe("ProjectCard_ExactClient_1");
    expect(generatedComponentName("ProjectCard", "server-part", 2)).toBe("ProjectCard_ExactServer_2");
    expect(generatedComponentName("123 Weird-Name", "client-island", 3)).toBe("_123_Weird_Name_ExactClient_3");
  });

  it("compiles TSX and JSX files from directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-project-"));
    await writeFile(path.join(root, "one.tsx"), "const one = <span />;");
    await writeFile(path.join(root, "two.jsx"), "const two = <strong />;");
    await writeFile(path.join(root, "skip.ts"), "const skip = 1;");

    const results = await compileProject([root], { outDir: path.join(root, "out") });

    expect(results.map(result => path.basename(result.outputFile ?? ""))).toEqual(["one.ts", "two.js"]);
  });
});

function planEntry(inputFile: string) {
  const base = inputFile.replace(/\.tsx$/, "");
  return {
    inputFile,
    clientFile: `${base}.exact.client.ts`,
    serverFile: `${base}.exact.server.ts`,
    manifestFile: `${base}.exact.manifest.json`
  };
}
