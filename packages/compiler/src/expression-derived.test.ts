import { describe, expect, it } from "vitest";
import { analyzeExpressionDerived } from "./expression-derived.js";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { buildExactProvenance } from "./provenance.js";

describe("expression-backed derived substitutions", () => {
  it("plans safe immutable reads by canonical variable identity", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("DerivedPlan.tsx", `function View(this: Component<{ value: number }>) {
      const doubled = this.state.value * 2;
      let mutable = this.state.value;
      mutable++;
      return () => <p>{doubled + mutable}</p>;
    }`);
    const plan = analyzeExpressionDerived(module, buildExactProvenance(module));
    const plannedText = [...plan.sites.values()].map(site => module.source.slice(site.start, site.end));
    expect(plannedText).toEqual(["doubled"]);
    expect(module.source.slice([...plan.sites.values()][0]!.initializerStart, [...plan.sites.values()][0]!.initializerEnd)).toBe("this.state.value * 2");
    expect([...plan.declarations.values()]).toContainEqual(expect.objectContaining({ cached: true }));
  });
});
