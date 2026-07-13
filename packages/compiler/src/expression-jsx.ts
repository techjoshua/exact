import type { BoundModule, Variable } from "@exact/expressions";
import { stableId } from "./ids.js";
import type { ExactProvenanceGraph } from "./provenance.js";
import { writeSiteKey } from "./expression-writes.js";

export interface ExpressionJsxElementSite {
  readonly start: number;
  readonly end: number;
  readonly tagName?: string;
  readonly intrinsic: boolean;
  readonly exactId?: string;
  readonly attributes: readonly string[];
}

export interface ExpressionJsxCellSite {
  readonly start: number;
  readonly end: number;
  readonly kind: "jsx-child" | "jsx-attribute";
  readonly dependencies: readonly Variable[];
  readonly reactive: boolean;
}

export interface ExpressionJsxPlan {
  readonly elements: ReadonlyMap<string, ExpressionJsxElementSite>;
  readonly cells: ReadonlyMap<string, ExpressionJsxCellSite>;
}

/** Indexes JSX identities and reactive cells from typed expression relationships. */
export function analyzeExpressionJsx(module: BoundModule, provenance: ExactProvenanceGraph, identityFilename = module.filename): ExpressionJsxPlan {
  const elements = new Map<string, ExpressionJsxElementSite>();
  for (const element of module.walk().jsxElements()) {
    if (!element.node.span) continue;
    const tagName = element.node.tagName;
    const intrinsic = !!tagName && (/^[a-z]/.test(tagName) || tagName.includes(":"));
    const site = Object.freeze({
      start: element.node.span.start,
      end: element.node.span.end,
      ...(tagName ? { tagName } : {}),
      intrinsic,
      ...(intrinsic ? { exactId: stableId(identityFilename, "element", String(element.node.span.start), String(element.node.span.end)) } : {}),
      attributes: Object.freeze(element.node.attributes.map(attribute => attribute.name).filter((name): name is string => !!name))
    });
    elements.set(writeSiteKey(site.start, site.end), site);
  }
  const reactiveCells = new Map(provenance.cells.filter(cell => cell.node.span).map(cell => [writeSiteKey(cell.node.span!.start, cell.node.span!.end), cell]));
  const cells = new Map<string, ExpressionJsxCellSite>();
  for (const expression of module.walk().ofKind("JsxExpression")) {
    if (!expression.node.span) continue;
    const key = writeSiteKey(expression.node.span.start, expression.node.span.end);
    const reactive = reactiveCells.get(key);
    const site = Object.freeze({
      start: expression.node.span.start,
      end: expression.node.span.end,
      kind: expression.parent?.node.kind === "JsxAttribute" ? "jsx-attribute" as const : "jsx-child" as const,
      dependencies: reactive?.dependencies ?? module.dependenciesOf(expression),
      reactive: reactive !== undefined
    });
    cells.set(writeSiteKey(site.start, site.end), site);
  }
  return Object.freeze({ elements, cells });
}
