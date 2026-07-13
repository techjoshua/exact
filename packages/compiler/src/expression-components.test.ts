import { describe, expect, it } from "vitest";
import { analyzeExpressionComponents } from "./expression-components.js";
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
        const server = readFile;
        return () => <button ref={this.ref()} onClick={() => console.log(window.innerWidth)}>{this.state.value}</button>;
      }`);
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "ComponentEffects.tsx");
    const site = analyzeExpressionComponents(module, jsx, tasks).sites.get("Mixed")!;
    expect(site.clientEffects).toBe(true);
    expect(site.serverEffects).toBe(true);
    expect(site.splitBoundaries).toEqual(expect.arrayContaining(["event-handler", "ref", "browser:window", "server-import:readFile"]));
    expect(site.browserGlobalsOutsideClientBoundary).toEqual([]);
  });

  it("reports browser globals outside managed client regions", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("BrowserEffect.tsx", "function View() { const width = window.innerWidth; return () => <p>{width}</p>; }");
    const tasks = analyzeExpressionTasks(module);
    const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), "BrowserEffect.tsx");
    expect(analyzeExpressionComponents(module, jsx, tasks).sites.get("View")?.browserGlobalsOutsideClientBoundary).toEqual(["window"]);
  });
});
