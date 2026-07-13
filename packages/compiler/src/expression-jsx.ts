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
  const cells = new Map<string, ExpressionJsxCellSite>();
  for (const cell of provenance.cells) {
    if (!cell.node.span) continue;
    const site = Object.freeze({ start: cell.node.span.start, end: cell.node.span.end, kind: cell.kind, dependencies: cell.dependencies });
    cells.set(writeSiteKey(site.start, site.end), site);
  }
  return Object.freeze({ elements, cells });
}
