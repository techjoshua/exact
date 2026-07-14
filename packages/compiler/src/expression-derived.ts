import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import type { ExactProvenanceGraph } from "./provenance.js";
import { writeSiteKey } from "./expression-writes.js";
import { expressionComponentIndex } from "./expression-component-index.js";

export interface ExpressionDerivedSite {
  readonly start: number;
  readonly end: number;
  readonly variableId: string;
  readonly initializerStart: number;
  readonly initializerEnd: number;
  readonly cached: boolean;
}

export interface ExpressionDerivedDeclaration {
  readonly variableId: string;
  readonly start: number;
  readonly end: number;
  readonly initializerStart: number;
  readonly initializerEnd: number;
  readonly cached: boolean;
}

export interface ExpressionDerivedPlan {
  readonly sites: ReadonlyMap<string, ExpressionDerivedSite>;
  readonly declarations: ReadonlyMap<string, ExpressionDerivedDeclaration>;
}

/** Plans safe derived substitutions using canonical bindings and immutable provenance. */
export function analyzeExpressionDerived(module: BoundModule, provenance: ExactProvenanceGraph): ExpressionDerivedPlan {
  const components = expressionComponentIndex(module);
  const sites = new Map<string, ExpressionDerivedSite>();
  const declarations = new Map<string, ExpressionDerivedDeclaration>();
  for (const entry of provenance.entries) {
    if (entry.provenance !== "derived" || !entry.safeToReevaluate) continue;
    const declaration = variableDeclaration(module, entry.variable);
    const initializer = declaration?.children().toArray().at(-1);
    if (!declaration || !initializer?.node.span || initializer.node === declaration.children().first()?.node) continue;
    const owner = declaration.ancestors().functions().first();
    const cached = components.isComponent(owner);
    if (declaration.node.span) {
      const planned = Object.freeze({
        variableId: entry.variable.id,
        start: declaration.node.span.start,
        end: declaration.node.span.end,
        initializerStart: initializer.node.span.start,
        initializerEnd: initializer.node.span.end,
        cached
      });
      declarations.set(writeSiteKey(planned.start, planned.end), planned);
    }
    const name = declaration.children().first();
    for (const reference of module.walk().references().where(candidate => candidate.variable === entry.variable)) {
      if (!reference.node.span || (name && within(reference, name))) continue;
      const site = Object.freeze({
        start: reference.node.span.start,
        end: reference.node.span.end,
        variableId: entry.variable.id,
        initializerStart: initializer.node.span.start,
        initializerEnd: initializer.node.span.end,
        cached
      });
      sites.set(writeSiteKey(site.start, site.end), site);
    }
  }
  return Object.freeze({ sites, declarations });
}

function variableDeclaration(module: BoundModule, variable: Variable): NodeRef | undefined {
  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const name = declaration.children().first();
    if (name?.walk().references().any(reference => reference.variable === variable)) return declaration;
  }
  return undefined;
}

function within(reference: NodeRef, owner: NodeRef): boolean {
  return !!reference.node.span && !!owner.node.span
    && reference.node.span.start >= owner.node.span.start
    && reference.node.span.end <= owner.node.span.end;
}
