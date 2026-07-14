import type { BoundModule, Variable } from "@exact/expressions";
import { stableId } from "./ids.js";
import type { ExactProvenanceGraph } from "./provenance.js";

export interface ExpressionJsxElementSite {
  readonly nodeId: string;
  readonly start: number;
  readonly end: number;
  readonly tagName?: string;
  readonly intrinsic: boolean;
  readonly exactId?: string;
  readonly attributes: readonly string[];
  readonly serverSlotChildren: boolean;
}

export interface ExpressionJsxCellSite {
  readonly nodeId: string;
  readonly start: number;
  readonly end: number;
  readonly kind: "jsx-child" | "jsx-attribute";
  readonly dependencies: readonly Variable[];
  readonly reactive: boolean;
}

export interface ExpressionJsxPlan {
  readonly elements: ReadonlyMap<string, ExpressionJsxElementSite>;
  readonly cells: ReadonlyMap<string, ExpressionJsxCellSite>;
  /** Contextual parameter types that JSX lowering would otherwise erase. */
  readonly contextualParameters: ReadonlyMap<string, string>;
}

/** Indexes JSX identities and reactive cells from typed expression relationships. */
export function analyzeExpressionJsx(module: BoundModule, provenance: ExactProvenanceGraph, identityFilename = module.filename): ExpressionJsxPlan {
  const elements = new Map<string, ExpressionJsxElementSite>();
  for (const element of module.walk().jsxElements()) {
    if (!element.node.span) continue;
    const tagName = element.node.tagName;
    const intrinsic = !!tagName && (/^[a-z]/.test(tagName) || tagName.includes(":"));
    const site = Object.freeze({
      nodeId: element.node.id,
      start: element.node.span.start,
      end: element.node.span.end,
      ...(tagName ? { tagName } : {}),
      intrinsic,
      ...(intrinsic ? { exactId: stableId(identityFilename, "element", element.node.id) } : {}),
      attributes: Object.freeze(element.node.attributes.map(attribute => attribute.name).filter((name): name is string => !!name))
      ,serverSlotChildren: element.node.jsxChildren.some(child => {
        if (child.kind === "JsxText") return false;
        if (child.kind === "JsxExpression") return module.ref(child).descendants().jsxElements().any();
        return child.kind === "JsxElement" || child.kind === "JsxSelfClosingElement" || child.kind === "JsxFragment";
      })
    });
    elements.set(site.nodeId, site);
  }
  const reactiveCells = new Map(provenance.cells.map(cell => [cell.node.id, cell]));
  const cells = new Map<string, ExpressionJsxCellSite>();
  for (const expression of module.walk().ofKind("JsxExpression")) {
    if (!expression.node.span) continue;
    const key = expression.node.id;
    const reactive = reactiveCells.get(key);
    const site = Object.freeze({
      nodeId: expression.node.id,
      start: expression.node.span.start,
      end: expression.node.span.end,
      kind: expression.parent?.node.kind === "JsxAttribute" ? "jsx-attribute" as const : "jsx-child" as const,
      dependencies: reactive?.dependencies ?? module.dependenciesOf(expression),
      reactive: reactive !== undefined
    });
    cells.set(site.nodeId, site);
  }
  const contextualParameters = new Map<string, string>();
  for (const attribute of module.walk().jsxAttributes()) {
    for (const fn of attribute.descendants().functions().where(candidate => !candidate.ancestors().functions().any(ancestor =>
      !!ancestor.node.span && !!attribute.node.span && ancestor.node.span.start >= attribute.node.span.start
    ))) {
      const declarations = fn.children().where(child => child.node.kind === "Parameter").toArray();
      declarations.forEach((parameter, index) => {
        if (!parameter.node.span || parameter.children().any(child => child.node.category === "type")) return;
        const type = fn.node.parameters[index]?.type;
        if (!type || type.kind === "any" || type.kind === "unknown") return;
        contextualParameters.set(parameter.node.id, type.display);
      });
    }
  }
  return Object.freeze({ elements, cells, contextualParameters });
}
