import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { buildExactProvenance } from "./provenance.js";
import { analyzeExpressionSafety } from "./expression-safety.js";

describe("expression-backed safety analysis", () => {
  it("rejects unmanaged global listeners without confusing shadowed bindings", () => {
    clearExpressionProjectCache();
    const unsafe = expressionModuleFor("UnsafeListener.tsx", `function Panel(this: Component<{}>) {
      window.addEventListener("resize", () => {});
      return () => <p />;
    }`);
    expect(analyzeExpressionSafety(unsafe, buildExactProvenance(unsafe)).get("Panel"))
      .toContainEqual(expect.stringContaining("browser-global addEventListener()"));

    const shadowed = expressionModuleFor("ShadowedListener.tsx", `function Panel(this: Component<{}>) {
      const window = { addEventListener() {} };
      window.addEventListener();
      return () => <p />;
    }`);
    expect(analyzeExpressionSafety(shadowed, buildExactProvenance(shadowed)).get("Panel")).toBeUndefined();
  });

  it("allows task listeners for compiler-managed abort ownership", () => {
    clearExpressionProjectCache();
    const source = (options: string) => expressionModuleFor(`TaskListener${options.length}.tsx`, `function Panel(this: Component<{}>) {
      this.task.client(({ signal }) => window.addEventListener("resize", () => {}, ${options}));
      return () => <p />;
    }`);
    const unsafe = source("{}");
    const safe = source("{ signal }");
    expect(analyzeExpressionSafety(unsafe, buildExactProvenance(unsafe)).get("Panel")).toBeUndefined();
    expect(analyzeExpressionSafety(safe, buildExactProvenance(safe)).get("Panel"))
      .toBeUndefined();
  });
});
