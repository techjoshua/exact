import { describe, expect, it } from "vitest";
import { analyzeExpressionJsx } from "./expression-jsx.js";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { buildExactProvenance } from "./provenance.js";

describe("expression-backed JSX plan", () => {
  it("indexes typed attributes, stable intrinsic ids, and reactive cells", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ExpressionJsx.tsx", `function Card(this: Component<{ title: string }>) {
      return () => <article className="card"><Title value={this.state.title} />{this.state.title}</article>;
    }`);
    const plan = analyzeExpressionJsx(module, buildExactProvenance(module));
    const article = [...plan.elements.values()].find(element => element.tagName === "article")!;
    const title = [...plan.elements.values()].find(element => element.tagName === "Title")!;
    expect(article.attributes).toContain("className");
    expect(article.exactId).toMatch(/^x/);
    expect(title.exactId).toBeUndefined();
    expect(plan.cells.size).toBeGreaterThanOrEqual(2);
  });
});
