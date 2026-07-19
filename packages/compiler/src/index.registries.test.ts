import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { build as esbuild, type Plugin } from "esbuild";
import { createTestWorkspace } from "./test-support/workspace.js";
import {
  analyzeSource,
  analyzeSemanticGraph,
  assertExactArtifactTarget,
  createClientIslandRegistryEntries,
  createClientIslandRegistryModule,
  createExactArtifactDevState,
  createExactArtifactGraph,
  createExactArtifactPlan,
  createExactArtifactRegistryModules,
  createExactHydrationRegistrationModule,
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

describe("@exact/compiler: registries", () => {
  it("creates client island registry entries for generated client artifacts", async () => {
    const root = await createTestWorkspace("exact-island-registry-");
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
    const root = await createTestWorkspace("exact-client-root-registry-");
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
    const root = await createTestWorkspace("exact-default-client-root-registry-");
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
    const root = await createTestWorkspace("exact-server-part-registry-");
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
    const root = await createTestWorkspace("exact-artifact-registry-modules-");
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

  it("creates hydration registration modules from artifact graphs", async () => {
    const root = await createTestWorkspace("exact-hydration-registration-module-");
    const input = path.join(root, "src", "panel.tsx");
    const outDir = path.join(root, "dist");
    await mkdir(path.dirname(input), { recursive: true });
    await writeFile(input, `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number; title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("panel.txt", "utf8");
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
    const actionId = Object.keys(result.manifest.serverActions)[0]!;
    const clientBoundaryId = result.manifest.boundaries.find(boundary => boundary.kind === "client-island")!.id;
    const module = createExactHydrationRegistrationModule(graph, {
      endpoint: "/__exact",
      endpoints: {
        actions: { [actionId]: "/remote-exact" }
      },
      islandsExportName: "islands",
      registrationExportName: "registration"
    });

    expect(module).toContain("export const islands");
    expect(module).toContain("composeExactComponentDescriptors as __exactComposeDescriptors");
    expect(module).toContain("import { Panel as __exactComponent0 }");
    expect(module).toContain("export const registration");
    expect(module).toContain("islands: islands");
    expect(module).toContain("\"endpoint\": \"/__exact\"");
    expect(module).toContain("\"/remote-exact\"");
    expect(module).toContain(JSON.stringify(actionId));
    expect(module).toContain("\"stateContracts\"");
    expect(module).toContain("\"title\"");
    expect(module).toContain("\"actionBoundaries\"");
    expect(module).toContain(JSON.stringify(clientBoundaryId));
  });

  it("includes component render edges in artifact graphs", async () => {
    const root = await createTestWorkspace("exact-artifact-component-graph-");
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
      id: expect.any(String),
      sourceFile: input,
      sourceComponentId: page.id,
      sourceName: "Page",
      targetComponentId: widget.id,
      targetName: "ClientWidget",
      tag: "ClientWidget",
      placement: "client",
      boundary: "client",
      index: 1,
      path: expect.any(String)
    }]);
  });

  it("emits server boundary stubs for pure client components", async () => {
    const root = await createTestWorkspace("exact-split-");
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
    expect(client).toMatch(/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
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

  it("infers derived state reads for client island snapshots", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ project: { title: string; owner: string } }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const title = this.state.project.title;
        const label = \`\${title} by \${this.state.project.owner}\`;
        return () => <button title={label} onClick={() => this.state.project.title = "Updated"}>{label}</button>;
      }
    `, { filename: "Panel.tsx", target: "server" });

    expect(output).toContain("\"__exactState\": { project: { owner: this.state.project.owner, title: this.state.project.title } }");
    expect(output).toContain("title: label");
    expect(output).not.toContain("onClick");
  });

  it("emits valid state snapshots for non-identifier path segments", () => {
    const output = transform(`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ items: Record<string, { title: string }> }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.items["first-item"].title} onClick={() => save()} />;
      }
    `, { filename: "Panel.tsx", target: "server" });

    expect(output).toContain("\"first-item\": { title: this.state.items[\"first-item\"].title }");
    expect(output).not.toContain("this.state.items.first-item");
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
    expect(output).toContain("export function Page()");
    expect(output).toContain("onClick: () => save()");
  });
});
