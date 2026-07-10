import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  compileFile,
  compileFileArtifacts,
  compileProject,
  createPackageExportMap,
  generatedComponentName,
  preprocessPropPunning,
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

      function ProjectPage(this: Component<{ project?: string; width?: number }>) {
        this.task(async ({ signal }) => {
          this.state.project = await readFile("project.txt", "utf8");
        });
        this.task(({ signal }) => {
          this.state.width = window.innerWidth;
        });
        return () => <span>{this.state.project}</span>;
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

  it("splits simple interactive JSX into server boundaries and client island exports", async () => {
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
    const island = islands[0]!;

    expect(result.manifest.components[0]!.clientIslandCount).toBe(2);
    expect(islands.map(symbol => symbol.generatedName)).toEqual(["Panel_ExactClient_1", "Panel_ExactClient_2"]);
    expect(island).toMatchObject({
      generatedName: "Panel_ExactClient_1",
      localName: "Panel_ExactClient_1",
      exportName: "Panel_ExactClient_1",
      target: "client",
      placement: "client"
    });
    expect(client).toContain("export function Panel");
    expect(client).toContain("export const Panel_ExactClient_1 = Panel;");
    expect(client).toContain("export const Panel_ExactClient_2 = Panel;");
    expect(server).toContain("createServerBoundary as");
    expect(server).toContain("Panel_ExactClient_1");
    expect(server).toContain("Panel_ExactClient_2");
    expect(server).toContain(island.id);
    expect(server).toContain("className: \"primary\"");
    expect(server).toContain("title: this.state.count");
    expect(server).toContain("disabled: true");
    expect(server).not.toContain("onClick");
  });

  it("infers arbitrary dynamic client island props in server artifacts", () => {
    const output = transform(`
      export function Panel(this: Component<{ count: number }>) {
        const label = String(this.state.count);
        return () => <button title={label} onClick={() => this.state.count++} />;
      }
    `, { target: "server" });

    expect(output).toContain("title: label");
    expect(output).toContain("Panel_ExactClient_1");
    expect(output).not.toContain("onClick");
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

  it("fails clearly when a client component with children cannot be split", () => {
    expect(() => transform(`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <ClientShell><p>Server child</p></ClientShell>;
      }
    `, { target: "server" })).toThrow("Cannot split client component ClientShell with children in server target");
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
