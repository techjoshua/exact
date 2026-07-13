import { describe, expect, it } from "vitest";
import { analyzeExpressionComponents, createExpressionComponentBoundaries, createExpressionComponents, createExpressionRenderEdges } from "./expression-components.js";
import { analyzeExpressionJsx } from "./expression-jsx.js";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { analyzeExpressionTasks } from "./expression-tasks.js";
import { buildExactProvenance } from "./provenance.js";

describe("expression-backed component effects", () => {
  it("classifies JSX, browser, server import, and task placement effects", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ComponentEffects.tsx", `import { readFile } from "node:fs";
      function Mixed(this: Component<{ value: string }>) {
        this.task.client([], ({ signal }) => window.addEventListener("resize", () => {}, { signal }));
        this.getContext(Theme);
        this.setContext(dynamicToken(), "value");
        const server = readFile;
        return () => <button ref={this.ref()} onClick={() => console.log(window.innerWidth)}>{this.state.value}</button>;
      }`);
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "ComponentEffects.tsx");
    const plan = analyzeExpressionComponents(module, jsx, tasks);
    const site = plan.sites.get("Mixed")!;
    expect(site.clientEffects).toBe(true);
    expect(site.serverEffects).toBe(true);
    expect(site.splitBoundaries).toEqual(expect.arrayContaining(["event-handler", "ref", "browser:window", "server-import:readFile"]));
    expect(site.browserGlobalsOutsideClientBoundary).toEqual([]);
    expect(site.contexts).toEqual(expect.arrayContaining([
      { token: "Theme", kind: "read", confidence: "exact" },
      { token: "unknown", kind: "write", confidence: "unknown" }
    ]));
    expect(createExpressionComponents("ComponentEffects.tsx", plan, tasks, new Map())[0]).toMatchObject({
      name: "Mixed",
      placement: "isomorphic",
      clientIslandCount: 1,
      tasks: [expect.objectContaining({ placement: "client", requestedPlacement: "client" })]
    });
    const edges = createExpressionRenderEdges("ComponentEffects.tsx", "Mixed", site.renders, new Map([
      ["button", { name: "button", placement: "client" as const }]
    ]));
    expect(edges).toEqual([]);
  });

  it("resolves canonical JSX render sites into stable component edges", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("RenderEdges.tsx", "function Parent() { return () => <section><Child /></section>; } function Child() { return () => <p />; }");
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "RenderEdges.tsx");
    const site = analyzeExpressionComponents(module, jsx, tasks).sites.get("Parent")!;
    const edges = createExpressionRenderEdges("RenderEdges.tsx", "Parent", site.renders, new Map([
      ["Child", { name: "Child", boundaryName: "Child", placement: "server" as const, componentId: "child-id" }]
    ]));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ tag: "Child", componentId: "child-id", placement: "server", index: 1 });
    expect(edges[0]?.path).not.toBe("");
    const owner = { id: "parent-id", name: "Parent", placement: "server" as const, subgraphPlacement: "server" as const, exported: false, renderEdges: edges, clientIslandCount: 0, tasks: [], contexts: [], splitBoundaries: [], diagnostics: [] };
    const boundaries = createExpressionComponentBoundaries("RenderEdges.tsx", [owner], analyzeExpressionComponents(module, jsx, tasks), new Map([
      ["Child", { name: "Child", boundaryName: "Child", placement: "client" as const, componentId: "child-id" }]
    ]));
    expect(boundaries).toEqual([expect.objectContaining({ name: "Child", ownerComponentId: "parent-id", renderEdgeId: edges[0]?.id, kind: "client-island" })]);
  });

  it("reports browser globals outside managed client regions", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("BrowserEffect.tsx", "function View() { const width = window.innerWidth; return () => <p>{width}</p>; }");
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "BrowserEffect.tsx");
    expect(analyzeExpressionComponents(module, jsx, tasks).sites.get("View")?.browserGlobalsOutsideClientBoundary).toEqual(["window"]);
  });

  it("owns client island counts and JSX binding diagnostics", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ComponentDiagnostics.tsx", `
      import type { TypeWidget } from "./TypeWidget.js";
      const ValueWidget = () => null;
      function View() { return () => <section onClick={() => {}}>
        <button onClick={() => {}}>nested</button>
        <TypeWidget /><ValueWidget /><MissingWidget />
      </section>; }
    `);
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "ComponentDiagnostics.tsx");
    const site = analyzeExpressionComponents(module, jsx, tasks).sites.get("View")!;
    expect(site.clientIslandCount).toBe(1);
    expect(site.diagnostics).toEqual(expect.arrayContaining([
      "error: JSX tag TypeWidget resolves to a type-only import and cannot be rendered at runtime",
      "error: JSX tag ValueWidget resolves to variable, not a runtime component",
      "error: JSX tag MissingWidget is not defined as a runtime component"
    ]));
  });
});
