import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  analyzeSemanticGraph,
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createExactArtifactDevState,
  createExactArtifactGraph,
  createExactArtifactPlan,
  createExactArtifactRegistryModules,
  createServerPartRegistryModule,
  compileArtifactPlanEntries,
  compileFile,
  compileFileArtifacts,
  compileProject,
  compileProjectArtifacts,
  createPackageExportMap,
  createServerPartRegistryEntries,
  diffExactArtifactPlans,
  exactExportConditions,
  exactCompilerManifestVersion,
  generatedComponentName,
  parseExactCompilerManifest,
  preprocessPropPunning,
  readExactArtifactManifestEntries,
  resolveExactArtifactImport,
  transform,
  transformSource,
  updateExactArtifactDevState
} from "./index.js";

describe("@exact/compiler", () => {
  it("builds a semantic graph for scopes declarations imports and references", () => {
    const graph = analyzeSemanticGraph(`
      import fsDefault, { readFile as readProject } from "node:fs/promises";
      import type { Stats } from "node:fs";
      import * as pathTools from "node:path";
      import { Widget } from "./Widget";

      const suffix = "!";

      export function ProjectPage(this: Component<{ title: string }>, props: { label: string }) {
        const fileStats: Stats | undefined = undefined;
        const title = props.label + suffix;
        this.task(async () => {
          this.state.title = await readProject("title.txt", "utf8");
          window.addEventListener("resize", () => pathTools.join("a", "b"));
        });
        return () => <section title={title}><Widget label={title} /></section>;
      }
    `, { filename: "ProjectPage.tsx" });

    const imports = graph.declarations.filter(declaration => declaration.kind === "import");
    expect(imports).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "fsDefault", moduleSpecifier: "node:fs/promises", importedName: "default" }),
      expect.objectContaining({ name: "readProject", moduleSpecifier: "node:fs/promises", importedName: "readFile" }),
      expect.objectContaining({ name: "Stats", moduleSpecifier: "node:fs", importedName: "Stats", typeOnly: true }),
      expect.objectContaining({ name: "pathTools", moduleSpecifier: "node:path", importedName: "*" }),
      expect.objectContaining({ name: "Widget", moduleSpecifier: "./Widget", importedName: "Widget" })
    ]));

    const titleDeclaration = graph.declarations.find(declaration => declaration.name === "title" && declaration.kind === "variable");
    const titleReferences = graph.references.filter(reference => reference.name === "title");
    expect(titleDeclaration).toBeDefined();
    expect(titleReferences).toHaveLength(2);
    expect(titleReferences.every(reference => reference.declarationId === titleDeclaration!.id)).toBe(true);

    expect(graph.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "readProject", source: "import", moduleSpecifier: "node:fs/promises", importedName: "readFile" }),
      expect.objectContaining({ name: "Stats", source: "import", moduleSpecifier: "node:fs", importedName: "Stats", typeOnly: true }),
      expect.objectContaining({ name: "pathTools", source: "import", moduleSpecifier: "node:path", importedName: "*" }),
      expect.objectContaining({ name: "Widget", source: "import", moduleSpecifier: "./Widget", importedName: "Widget" }),
      expect.objectContaining({ name: "window", source: "global" }),
      expect.objectContaining({ name: "props", source: "local" }),
      expect.objectContaining({ name: "suffix", source: "local" })
    ]));
    expect(graph.references.some(reference => reference.name === "section")).toBe(false);
    expect(graph.references.some(reference => reference.name === "label")).toBe(false);
  });

  it("resolves semantic references after later declarations are collected", () => {
    const graph = analyzeSemanticGraph(`
      export function Panel() {
        const title = formatTitle("Ready");
        function formatTitle(value: string) {
          return value.toUpperCase();
        }
        return () => <h1>{title}</h1>;
      }
    `, { filename: "Panel.tsx" });

    const declaration = graph.declarations.find(item => item.name === "formatTitle" && item.kind === "function");
    const reference = graph.references.find(item => item.name === "formatTitle");
    expect(declaration).toBeDefined();
    expect(reference).toMatchObject({
      source: "local",
      declarationId: declaration!.id
    });
  });

  it("resolves local export specifiers as semantic references", () => {
    const graph = analyzeSemanticGraph(`
      export function DirectPage() {
        return () => <p>Direct</p>;
      }

      function ProjectPage() {
        return () => <p>Ready</p>;
      }

      export { ProjectPage as Page };
      export { RemotePage } from "./remote";
    `, { filename: "ProjectPage.tsx" });

    expect(graph.declarations).toContainEqual(expect.objectContaining({
      name: "DirectPage",
      kind: "function",
      exportedName: "DirectPage"
    }));
    const declaration = graph.declarations.find(item => item.name === "ProjectPage" && item.kind === "function");
    const reference = graph.references.find(item => item.name === "ProjectPage");
    expect(declaration).toBeDefined();
    expect(reference).toMatchObject({
      source: "local",
      declarationId: declaration!.id,
      declarationKind: "function",
      exportedName: "Page"
    });
    expect(graph.references.some(item => item.name === "RemotePage")).toBe(false);
  });

  it("includes the semantic graph in analyzed manifests", () => {
    const manifest = analyzeSource(`
      const label = "Ready";

      export function ProjectPage() {
        return () => <p>{label}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    expect(manifest.semanticGraph).toBeDefined();
    expect(manifest.semanticGraph!.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "label", kind: "variable" }),
      expect.objectContaining({ name: "ProjectPage", kind: "function" })
    ]));
    expect(manifest.semanticGraph!.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "label", source: "local" })
    ]));
  });

  it("resolves local type declarations and type references semantically", () => {
    const graph = analyzeSemanticGraph(`
      interface BaseProject {
        id: string;
      }

      interface Project extends BaseProject {
        title: string;
      }

      type ProjectState = {
        project: Project;
      };

      export function ProjectPage(this: Component<ProjectState>) {
        const state: ProjectState | undefined = undefined;
        return () => <p>{this.state.project.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const base = graph.declarations.find(item => item.name === "BaseProject" && item.kind === "interface");
    const project = graph.declarations.find(item => item.name === "Project" && item.kind === "interface");
    const state = graph.declarations.find(item => item.name === "ProjectState" && item.kind === "type");
    expect(base).toBeDefined();
    expect(project).toBeDefined();
    expect(state).toBeDefined();
    expect(graph.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "BaseProject", source: "local", declarationId: base!.id, typeOnly: true }),
      expect.objectContaining({ name: "Project", source: "local", declarationId: project!.id, typeOnly: true }),
      expect.objectContaining({ name: "ProjectState", source: "local", declarationId: state!.id, typeOnly: true })
    ]));
  });

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

  it("traces state aliases in task state contracts", () => {
    const manifest = analyzeSource(`
      export function ProjectPage(this: Component<{ project: { title: string }; count: number }>) {
        this.task(() => {
          const state = this.state;
          const project = state.project;
          project.title = project.title.trim();
          Object.assign(state, { count: 1 });
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const task = manifest.components[0]!.tasks[0]!;
    expect(task.writes).toEqual(expect.arrayContaining([
      { path: "project.title", kind: "write", confidence: "exact" },
      { path: "*", kind: "write", confidence: "broad" }
    ]));
    expect(task.reads).toEqual(expect.arrayContaining([
      { path: "project", kind: "read", confidence: "exact" },
      { path: "project.title", kind: "read", confidence: "exact" }
    ]));
  });

  it("traces destructured state aliases in task state contracts", () => {
    const manifest = analyzeSource(`
      export function ProjectPage(this: Component<{ project: { title: string }; queue: string[] }>) {
        this.task(() => {
          const { project: currentProject, queue } = this.state;
          const { title } = currentProject;
          currentProject.title = title.trim();
          queue.push("done");
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const task = manifest.components[0]!.tasks[0]!;
    expect(task.writes).toEqual(expect.arrayContaining([
      { path: "project.title", kind: "write", confidence: "exact" },
      { path: "queue", kind: "write", confidence: "broad" }
    ]));
    expect(task.reads).toEqual(expect.arrayContaining([
      { path: "project.title", kind: "read", confidence: "exact" }
    ]));
  });

  it("uses state aliases in server action contracts", () => {
    const manifest = analyzeSource(`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ project: { title?: string } }>) {
        this.task(async () => {
          const project = this.state.project;
          project.title = await readFile("project.txt", "utf8");
        });
        return () => <p>{this.state.project.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const task = manifest.components[0]!.tasks[0]!;
    const action = Object.values(manifest.serverActions)[0]!;
    expect(task.placement).toBe("server");
    expect(action.stateContract.writes).toContainEqual({
      path: "project.title",
      kind: "write",
      confidence: "exact"
    });
  });

  it("uses resolved references when classifying task environments", () => {
    const manifest = analyzeSource(`
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ title?: string; width?: number }>) {
        this.task(() => {
          const readFile = () => "local";
          this.state.title = readFile();
        });
        this.task(() => {
          const window = { innerWidth: 42 };
          this.state.width = window.innerWidth;
        });
        return () => <p>{this.state.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const component = manifest.components[0]!;
    expect(component.tasks.map(task => task.placement)).toEqual(["isomorphic", "isomorphic"]);
    expect(component.splitBoundaries).not.toContain("server-import:readFile");
    expect(component.splitBoundaries).not.toContain("browser:window");
  });

  it("does not classify type-only server imports as runtime server effects", () => {
    const manifest = analyzeSource(`
      import type { Stats } from "node:fs";

      export function ProjectPage(this: Component<{ title?: string }>) {
        this.task(() => {
          const stats: Stats | undefined = undefined;
          this.state.title = stats ? "ready" : "missing";
        });
        return () => <p>{this.state.title}</p>;
      }
    `, { filename: "ProjectPage.tsx" });

    const component = manifest.components[0]!;
    expect(component.tasks[0]!.placement).toBe("isomorphic");
    expect(component.splitBoundaries).not.toContain("server-import:Stats");
    expect(Object.values(manifest.serverActions)[0]!.stateContract.writes).toContainEqual({
      path: "title",
      kind: "write",
      confidence: "exact"
    });
  });

  it("preserves type-only server imports in client artifacts", () => {
    const client = transform(`
      import type { Stats } from "node:fs";
      import { readFile } from "node:fs/promises";

      export function ProjectPage(this: Component<{ title?: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        const stats: Stats | undefined = undefined;
        return () => <p>{stats ? this.state.title : "missing"}</p>;
      }
    `, { filename: "ProjectPage.tsx", target: "client" });

    expect(client).toContain("import type { Stats } from \"node:fs\";");
    expect(client).not.toContain("node:fs/promises");
    expect(client).not.toContain("readFile");
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

  it("reads generated artifact manifests into graph entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-manifest-entries-"));
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

    const compiled = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const entries = await readExactArtifactManifestEntries([compiled.manifestFile]);
    const graph = createExactArtifactGraph(entries, {
      packageRoot: root,
      sourceRoot: path.join(root, "src"),
      rootDir: root
    });

    expect(entries).toEqual([{
      inputFile: compiled.inputFile,
      clientFile: compiled.clientFile,
      serverFile: compiled.serverFile,
      manifestFile: compiled.manifestFile,
      manifest: expect.objectContaining({
        filename: compiled.manifest.filename
      })
    }]);
    expect(graph.clientIslands).toEqual([expect.objectContaining({
      name: "Panel_ExactClient_1",
      module: "./dist/panel.exact.client.ts"
    })]);
    expect(graph.serverParts).toEqual([expect.objectContaining({
      name: "Panel_ExactServer_1",
      module: "./dist/panel.exact.server.ts"
    })]);
  });

  it("rejects unsupported generated artifact manifest versions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-manifest-version-"));
    const manifestFile = path.join(root, "panel.exact.manifest.json");
    await writeFile(manifestFile, JSON.stringify({
      version: exactCompilerManifestVersion + 1,
      artifacts: {
        source: "panel.tsx",
        client: "panel.exact.client.ts",
        server: "panel.exact.server.ts",
        manifest: "panel.exact.manifest.json",
        exports: [],
        symbols: [],
        boundaries: []
      }
    }));

    await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow("Unsupported eXact artifact manifest version");
  });

  it("rejects malformed compiler manifests before use", () => {
    expect(() => parseExactCompilerManifest({
      version: exactCompilerManifestVersion,
      filename: "Panel.tsx",
      components: []
    }, "Panel.exact.manifest.json")).toThrow("Malformed eXact compiler manifest");
  });

  it("rejects malformed generated artifact metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-manifest-malformed-"));
    const manifestFile = path.join(root, "panel.exact.manifest.json");
    await writeFile(manifestFile, JSON.stringify({
      version: exactCompilerManifestVersion,
      filename: "panel.tsx",
      components: [],
      exports: [],
      symbols: [],
      boundaries: [],
      artifacts: {
        source: 1,
        client: "panel.exact.client.ts",
        server: "panel.exact.server.ts",
        manifest: "panel.exact.manifest.json",
        exports: [],
        symbols: [],
        boundaries: []
      },
      serverActions: {},
      diagnostics: []
    }));

    await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow("malformed artifact metadata");
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

  it("compiles selected artifact plan entries for incremental builds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-entry-"));
    const src = path.join(root, "src");
    const outDir = path.join(root, ".exact");
    const changedInput = path.join(src, "changed.tsx");
    const retainedInput = path.join(src, "retained.tsx");
    await mkdir(src, { recursive: true });
    await writeFile(changedInput, "export function Changed() { return () => <p>Changed</p>; }");
    await writeFile(retainedInput, "export function Retained() { return () => <p>Retained</p>; }");

    const previous = await createExactArtifactPlan([src], {
      outDir,
      rootDir: src
    });
    const next = await createExactArtifactPlan([src], {
      outDir,
      rootDir: src
    });
    const diff = diffExactArtifactPlans(previous, next, {
      changedInputs: [changedInput]
    });
    const results = await compileArtifactPlanEntries(diff.changed);

    expect(results).toHaveLength(1);
    expect(results[0]!.inputFile).toBe(changedInput);
    expect(await readFile(results[0]!.clientFile, "utf8")).toContain("Changed");
    await expect(readFile(path.join(outDir, "retained.exact.client.ts"), "utf8")).rejects.toThrow();
  });

  it("uses retained manifests when compiling selected artifact plan entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-retained-manifests-"));
    const src = path.join(root, "src");
    const outDir = path.join(root, ".exact");
    const widgetInput = path.join(src, "ClientWidget.tsx");
    const pageInput = path.join(src, "Page.tsx");
    await mkdir(src, { recursive: true });
    await writeFile(widgetInput, `
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `);
    await writeFile(pageInput, `
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <ClientWidget />;
      }
    `);

    const initial = await compileProjectArtifacts([src], {
      outDir,
      rootDir: src
    });
    const retained = await readExactArtifactManifestEntries(initial
      .filter(result => result.inputFile === widgetInput)
      .map(result => result.manifestFile));
    const plan = await createExactArtifactPlan([src], {
      outDir,
      rootDir: src
    });
    const changedPage = plan.entries.filter(entry => entry.inputFile === pageInput);
    const updated = await compileArtifactPlanEntries(changedPage, {
      importedManifests: retained.map(entry => entry.manifest)
    });
    const server = await readFile(updated[0]!.serverFile, "utf8");

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).not.toContain("from \"./ClientWidget\"");
  });

  it("updates dev-server artifact state with retained manifest context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-dev-state-"));
    const src = path.join(root, "src");
    const outDir = path.join(root, ".exact");
    const widgetInput = path.join(src, "ClientWidget.tsx");
    const pageInput = path.join(src, "Page.tsx");
    await mkdir(src, { recursive: true });
    await writeFile(widgetInput, `
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `);
    await writeFile(pageInput, `
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <ClientWidget />;
      }
    `);

    const state = await createExactArtifactDevState([src], {
      outDir,
      rootDir: src,
      packageRoot: root,
      sourceRoot: src
    });
    await writeFile(pageInput, `
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `);

    const updated = await updateExactArtifactDevState(state, [src], [pageInput], {
      outDir,
      rootDir: src,
      packageRoot: root,
      sourceRoot: src
    });
    const pageServer = await readFile(updated.compiled[0]!.serverFile, "utf8");

    expect(updated.diff.changed).toEqual([expect.objectContaining({ inputFile: pageInput })]);
    expect(updated.compiled.map(result => result.inputFile)).toEqual([pageInput]);
    expect(updated.entries.map(entry => entry.inputFile).sort()).toEqual([pageInput, widgetInput].sort());
    expect(updated.graph.artifacts.map(entry => entry.inputFile).sort()).toEqual([pageInput, widgetInput].sort());
    expect(pageServer).toContain("__exactBoundary");
    expect(pageServer).toContain("\"ClientWidget\"");
    expect(pageServer).not.toContain("from \"./ClientWidget\"");
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
    })).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: "Panel_ExactClient_1",
        exportName: "Panel_ExactClient_1",
        module: "./dist/panel.exact.client.ts",
        componentId: result.manifest.components[0]!.id
      })
    ]);
  });

  it("creates client registry entries for exported pure client components", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-client-root-registry-"));
    const input = path.join(root, "src", "ClientWidget.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });

    expect(createClientIslandRegistryEntries([result], {
      rootDir: root
    })).toContainEqual({
      id: expect.any(String),
      name: "ClientWidget",
      exportName: "ClientWidget",
      module: "./dist/ClientWidget.exact.client.ts",
      componentId: result.manifest.components[0]!.id
    });
  });

  it("creates client registry modules for default-exported client roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-default-client-root-registry-"));
    const input = path.join(root, "src", "ClientWidget.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      export default function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const module = createClientIslandRegistryModule(createClientIslandRegistryEntries([result], {
      rootDir: root
    }));

    expect(module).toContain("import { default as __exactRegistry0 } from \"./dist/ClientWidget.exact.client.ts\";");
    expect(module).toContain("\"ClientWidget\": __exactRegistry0");
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

  it("creates ESM modules for client and server registries", () => {
    expect(createClientIslandRegistryModule([{
      id: "client-1",
      name: "Panel_ExactClient_1",
      exportName: "Panel_ExactClient_1",
      module: "./panel.exact.client.ts"
    }])).toBe([
      "import { Panel_ExactClient_1 as __exactRegistry0 } from \"./panel.exact.client.ts\";",
      "",
      "export const exactClientIslands = {",
      "  \"Panel_ExactClient_1\": __exactRegistry0",
      "};",
      ""
    ].join("\n"));

    expect(createServerPartRegistryModule([{
      id: "server-1",
      name: "Panel_ExactServer_1",
      exportName: "Panel_ExactServer_1",
      module: "./panel.exact.server.ts"
    }], { exportName: "parts" })).toContain("export const parts");
  });

  it("rejects duplicate registry module names", () => {
    expect(() => createClientIslandRegistryModule([
      {
        id: "one",
        name: "Panel",
        exportName: "Panel",
        module: "./one.ts"
      },
      {
        id: "two",
        name: "Panel",
        exportName: "Panel",
        module: "./two.ts"
      }
    ])).toThrow("Duplicate eXact registry entry Panel");
  });

  it("creates registry modules from artifact graphs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-registry-modules-"));
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
      sourceRoot: path.join(root, "src"),
      rootDir: root
    });
    const modules = createExactArtifactRegistryModules(graph, {
      clientExportName: "clientRegistry",
      serverExportName: "serverRegistry"
    });

    expect(modules.client).toContain("export const clientRegistry");
    expect(modules.client).toContain("Panel_ExactClient_1");
    expect(modules.server).toContain("export const serverRegistry");
    expect(modules.server).toContain("Panel_ExactServer_1");
  });

  it("includes component render edges in artifact graphs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-artifact-component-graph-"));
    const input = path.join(root, "src", "page.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `);

    const result = await compileFileArtifacts(input, {
      outDir,
      rootDir: path.join(root, "src")
    });
    const graph = createExactArtifactGraph([result], {
      packageRoot: root,
      sourceRoot: path.join(root, "src"),
      rootDir: root
    });
    const page = result.manifest.components.find(component => component.name === "Page")!;
    const widget = result.manifest.components.find(component => component.name === "ClientWidget")!;

    expect(graph.componentEdges).toEqual([{
      sourceFile: input,
      sourceComponentId: page.id,
      sourceName: "Page",
      targetComponentId: widget.id,
      targetName: "ClientWidget",
      tag: "ClientWidget",
      placement: "client",
      boundary: "client"
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
      ownerComponentId: result.manifest.components[0]!.id,
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

  it("infers aliased state reads for client island snapshots", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ project: { title: string } }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const project = this.state.project;
        return () => <button title={project.title} onClick={() => project.title = "Updated"} />;
      }
    `, { filename: "Panel.tsx", target: "server" });

    expect(output).toContain("\"__exactState\": { project: { title: this.state.project.title } }");
    expect(output).toContain("title: project.title");
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

    expect(output).toContain("export function Panel_ExactClient_1(this: any, props: any = {})");
    expect(output).toContain("Object.assign(this.state, props.__exactState)");
    expect(output).toContain("title: props.title");
    expect(output).toContain("onClick: () => this.state.count++");
    expect(output).not.toContain("export const Panel_ExactClient_1 = Panel");
  });

  it("omits server-owned roots from client artifacts in server component mode", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.count} onClick={() => this.state.count++} />;
      }
    `, { filename: "Panel.tsx", target: "client", serverComponents: true });

    expect(output).toContain("export function Panel_ExactClient_1(this: any, props: any = {})");
    expect(output).not.toContain("export function Panel(");
    expect(output).not.toContain("node:fs/promises");
    expect(output).not.toContain("readFile");
    expect(output).toContain("onClick: () => this.state.count++");
  });

  it("keeps pure client components in client artifacts during server component mode", () => {
    const output = transform(`
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `, { filename: "Page.tsx", target: "client", serverComponents: true });

    expect(output).toContain("function ClientWidget()");
    expect(output).not.toContain("export function Page()");
    expect(output).toContain("onClick: () => save()");
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

    expect(client).toContain("export function Panel_ExactClient_1(this: any, props: any = {})");
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

  it("does not capture shadowed client island identifiers", () => {
    const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={(label) => console.log(label)}>Save</button>;
      }
    `;
    const client = transform(source, { filename: "Panel.tsx", target: "client" });
    const server = transform(source, { filename: "Panel.tsx", target: "server" });

    expect(server).not.toContain("__exactCapture");
    expect(client).toContain("onClick: (label) => console.log(label)");
    expect(client).not.toContain("props.__exactCapture.label");
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
    expect(client).toContain("export function Panel_ExactClient_1(this: any, props: any = {})");
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
      ownerComponentId: result.manifest.components.find(component => component.name === "Page")!.id,
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

    const slotBoundary = manifest.boundaries.find(boundary => boundary.name === "ClientShell:children" && boundary.kind === "server-slot");
    expect(slotBoundary).toBeDefined();
    expect(manifest.boundaries).toContainEqual(expect.objectContaining({
      id: slotBoundary!.id.slice(0, -":children".length),
      name: "ClientShell",
      componentId: slotBoundary!.componentId,
      ownerComponentId: slotBoundary!.ownerComponentId,
      kind: "client-island"
    }));
    expect(manifest.boundaries.filter(boundary => boundary.name === "ClientShell:children" && boundary.kind === "server-slot")).toHaveLength(1);
  });

  it("uses distinct boundaries for repeated client component tag instances", () => {
    const source = `
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <>
          <ClientShell><p>First</p></ClientShell>
          <ClientShell><p>Second</p></ClientShell>
        </>;
      }
    `;
    const manifest = analyzeSource(source, { filename: "Page.tsx" });
    const server = transform(source, { filename: "Page.tsx", target: "server" });

    const slotBoundaries = manifest.boundaries.filter(boundary => boundary.name === "ClientShell:children" && boundary.kind === "server-slot");
    const slottedClientBoundaryIds = slotBoundaries.map(boundary => boundary.id.slice(0, -":children".length));
    const slottedClientBoundaries = manifest.boundaries.filter(boundary => slottedClientBoundaryIds.includes(boundary.id));
    const emittedBoundaryIds = Array.from(server.matchAll(/__exactBoundary\("([^"]+)", "ClientShell"/g), match => match[1]);

    expect(slotBoundaries).toHaveLength(2);
    expect(slottedClientBoundaries).toHaveLength(2);
    expect(new Set(slottedClientBoundaryIds).size).toBe(2);
    expect(slotBoundaries.map(boundary => boundary.id).sort()).toEqual(slottedClientBoundaries.map(boundary => `${boundary.id}:children`).sort());
    expect(emittedBoundaryIds.filter(id => slottedClientBoundaryIds.includes(id))).toEqual(slottedClientBoundaries.map(boundary => boundary.id));
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

  it("splits imported client components using project manifests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "exact-imported-component-split-"));
    const srcDir = path.join(root, "src");
    const outDir = path.join(root, "out");
    const widgetFile = path.join(srcDir, "ClientWidget.tsx");
    const pageFile = path.join(srcDir, "Page.tsx");
    await mkdir(srcDir, { recursive: true });
    await writeFile(widgetFile, `
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string; children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}{props.children}</button>;
      }
    `);
    await writeFile(pageFile, `
      import { ClientWidget } from "./ClientWidget";

      export function Page(this: Component<{ title: string }>) {
        this.state.title = "Ready";
        return () => <section><ClientWidget title={this.state.title}><p>Server child</p></ClientWidget></section>;
      }
    `);

    const results = await compileProjectArtifacts([srcDir], {
      outDir,
      rootDir: srcDir
    });
    const page = results.find(result => result.inputFile === pageFile)!;
    const widget = results.find(result => result.inputFile === widgetFile)!;
    const server = await readFile(page.serverFile, "utf8");

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).toContain("title: this.state.title");
    expect(server).toContain("__exactVNode(\"p\"");
    expect(server).toContain("\"Server child\"");
    expect(server).not.toContain("from \"./ClientWidget\"");
    expect(server).not.toContain("window.innerWidth");
    expect(page.manifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget",
      componentId: widget.manifest.components[0]!.id,
      kind: "client-island"
    }));
    expect(page.manifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget:children",
      componentId: widget.manifest.components[0]!.id,
      kind: "server-slot"
    }));
  });

  it("does not split an imported client component when a local binding shadows it", () => {
    const widgetManifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const source = `
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        const ClientWidget = "local";
        return () => <section><ClientWidget /></section>;
      }
    `;
    const manifest = analyzeSource(source, {
      filename: "/src/Page.tsx",
      importedManifests: [widgetManifest]
    });

    expect(manifest.boundaries.filter(boundary => boundary.name === "ClientWidget")).toHaveLength(0);
    expect(manifest.components[0]!.renderEdges).toEqual([]);
    expect(manifest.components[0]!.diagnostics).toContain("error: JSX tag ClientWidget resolves to variable, not a runtime component");
    expect(() => transform(source, {
      filename: "/src/Page.tsx",
      target: "server",
      importedManifests: [widgetManifest]
    })).toThrow("JSX tag ClientWidget resolves to variable");
  });

  it("does not split type-only imported component names", () => {
    const widgetManifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const source = `
      import type { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <section><ClientWidget /></section>;
      }
    `;
    const manifest = analyzeSource(source, {
      filename: "/src/Page.tsx",
      importedManifests: [widgetManifest]
    });

    expect(manifest.boundaries.filter(boundary => boundary.name === "ClientWidget")).toHaveLength(0);
    expect(manifest.components[0]!.renderEdges).toEqual([]);
    expect(manifest.components[0]!.diagnostics).toContain("error: JSX tag ClientWidget resolves to a type-only import and cannot be rendered at runtime");
    expect(() => transform(source, {
      filename: "/src/Page.tsx",
      target: "server",
      importedManifests: [widgetManifest]
    })).toThrow("JSX tag ClientWidget resolves to a type-only import");
  });

  it("diagnoses unresolved runtime JSX component tags", () => {
    const source = `
      export function Page() {
        return () => <MissingWidget />;
      }
    `;
    const manifest = analyzeSource(source, { filename: "/src/Page.tsx" });

    expect(manifest.components[0]!.diagnostics).toContain("error: JSX tag MissingWidget is not defined as a runtime component");
    expect(() => transform(source, { filename: "/src/Page.tsx" })).toThrow("JSX tag MissingWidget is not defined");
  });

  it("diagnoses JSX tags that resolve to non-component values", () => {
    const source = `
      const Widget = "not a component";

      export function Page() {
        return () => <Widget />;
      }
    `;
    const manifest = analyzeSource(source, { filename: "/src/Page.tsx" });

    expect(manifest.components[0]!.diagnostics).toContain("error: JSX tag Widget resolves to variable, not a runtime component");
    expect(() => transform(source, { filename: "/src/Page.tsx" })).toThrow("JSX tag Widget resolves to variable");
  });

  it("uses exported component identity for aliased imported client boundaries", () => {
    const manifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const source = `
      import { ClientWidget as Widget } from "./ClientWidget";

      export function Page() {
        return () => <Widget />;
      }
    `;
    const server = transform(source, {
      filename: "/src/Page.tsx",
      target: "server",
      importedManifests: [manifest]
    });
    const pageManifest = analyzeSource(source, {
      filename: "/src/Page.tsx",
      importedManifests: [manifest]
    });

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).not.toContain("\"Widget\"");
    expect(pageManifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget",
      componentId: manifest.components[0]!.id,
      kind: "client-island"
    }));
  });

  it("splits default imported client components using author boundary names", () => {
    const manifest = analyzeSource(`
      export default function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const source = `
      import Widget from "./ClientWidget";

      export function Page() {
        return () => <Widget />;
      }
    `;
    const server = transform(source, {
      filename: "/src/Page.tsx",
      target: "server",
      importedManifests: [manifest]
    });
    const pageManifest = analyzeSource(source, {
      filename: "/src/Page.tsx",
      importedManifests: [manifest]
    });

    expect(manifest.exports).toContainEqual({
      name: "default",
      kind: "component",
      placement: "client"
    });
    expect(manifest.symbols).toContainEqual(expect.objectContaining({
      exportName: "default",
      localName: "ClientWidget",
      generatedName: "ClientWidget"
    }));
    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).not.toContain("\"Widget\"");
    expect(pageManifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget",
      componentId: manifest.components[0]!.id,
      kind: "client-island"
    }));
  });

  it("splits namespace imported client components using exported boundary names", () => {
    const manifest = analyzeSource(`
      export function ClientWidget(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.children}</button>;
      }
    `, { filename: "/src/widgets.tsx" });
    const source = `
      import * as Widgets from "./widgets";

      export function Page() {
        return () => <Widgets.ClientWidget><p>Server child</p></Widgets.ClientWidget>;
      }
    `;
    const server = transform(source, {
      filename: "/src/Page.tsx",
      target: "server",
      importedManifests: [manifest]
    });
    const pageManifest = analyzeSource(source, {
      filename: "/src/Page.tsx",
      importedManifests: [manifest]
    });

    expect(server).toContain("__exactBoundary");
    expect(server).toContain("\"ClientWidget\"");
    expect(server).not.toContain("\"Widgets.ClientWidget\"");
    expect(server).toContain("__exactVNode(\"p\"");
    expect(pageManifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget",
      componentId: manifest.components[0]!.id,
      kind: "client-island"
    }));
    expect(pageManifest.boundaries).toContainEqual(expect.objectContaining({
      name: "ClientWidget:children",
      componentId: manifest.components[0]!.id,
      kind: "server-slot"
    }));
  });

  it("records component render subgraphs for local client boundaries", () => {
    const manifest = analyzeSource(`
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <section><ClientWidget /></section>;
      }
    `, { filename: "/src/Page.tsx" });

    const page = manifest.components.find(component => component.name === "Page")!;
    const widget = manifest.components.find(component => component.name === "ClientWidget")!;

    expect(page.placement).toBe("server");
    expect(page.subgraphPlacement).toBe("isomorphic");
    expect(page.renderEdges).toEqual([expect.objectContaining({
      tag: "ClientWidget",
      name: "ClientWidget",
      componentId: widget.id,
      placement: "client",
      boundary: "client"
    })]);
  });

  it("records component render subgraphs for imported component boundaries", () => {
    const widgetManifest = analyzeSource(`
      export default function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }
    `, { filename: "/src/ClientWidget.tsx" });
    const namespaceManifest = analyzeSource(`
      export function ServerShell() {
        return () => <section />;
      }
    `, { filename: "/src/shells.tsx" });
    const manifest = analyzeSource(`
      import Widget from "./ClientWidget";
      import * as Shells from "./shells";

      export function Page() {
        return () => <Shells.ServerShell><Widget /></Shells.ServerShell>;
      }
    `, {
      filename: "/src/Page.tsx",
      importedManifests: [widgetManifest, namespaceManifest]
    });

    const page = manifest.components[0]!;

    expect(page.subgraphPlacement).toBe("isomorphic");
    expect(page.renderEdges).toEqual([
      expect.objectContaining({
        tag: "Shells.ServerShell",
        name: "ServerShell",
        componentId: namespaceManifest.components[0]!.id,
        placement: "server",
        boundary: "server"
      }),
      expect.objectContaining({
        tag: "Widget",
        name: "ClientWidget",
        componentId: widgetManifest.components[0]!.id,
        placement: "client",
        boundary: "client"
      })
    ]);
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
