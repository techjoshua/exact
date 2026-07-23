import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import type { ExactProvenanceGraph } from '../provenance.js';
import { expressionComponentIndex } from './component-index.js';

/** Defines the expression derived site interface contract. */
export interface ExpressionDerivedSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly variableId: string;
	readonly initializerStart: number;
	readonly initializerEnd: number;
	readonly initializerNodeId: string;
	readonly cached: boolean;
}

/** Defines the expression derived declaration interface contract. */
export interface ExpressionDerivedDeclaration {
	readonly nodeId: string;
	readonly variableId: string;
	readonly start: number;
	readonly end: number;
	readonly initializerStart: number;
	readonly initializerEnd: number;
	readonly initializerNodeId: string;
	readonly cached: boolean;
}

/** Describes the planned expression derived operation. */
export interface ExpressionDerivedPlan {
	readonly sites: ReadonlyMap<string, ExpressionDerivedSite>;
	readonly declarations: ReadonlyMap<string, ExpressionDerivedDeclaration>;
}

/** Plans safe derived substitutions using canonical bindings and immutable provenance. */
export function analyzeExpressionDerived(
	module: BoundModule,
	provenance: ExactProvenanceGraph
): ExpressionDerivedPlan {
	const components = expressionComponentIndex(module);
	const sites = new Map<string, ExpressionDerivedSite>();
	const declarations = new Map<string, ExpressionDerivedDeclaration>();
	for (const entry of provenance.entries) {
		if (entry.provenance !== 'derived' || !entry.safeToReevaluate) continue;
		const declaration = variableDeclaration(module, entry.variable);
		const initializer = declaration?.children().toArray().at(-1);
		if (
			!declaration ||
			!initializer?.node.span ||
			initializer.node === declaration.children().first()?.node
		)
			continue;
		const owner = declaration.ancestors().functions().first();
		const cached = components.isComponent(owner);
		if (declaration.node.span) {
			const planned = Object.freeze({
				nodeId: declaration.node.id,
				variableId: entry.variable.id,
				start: declaration.node.span.start,
				end: declaration.node.span.end,
				initializerStart: initializer.node.span.start,
				initializerEnd: initializer.node.span.end,
				initializerNodeId: initializer.node.id,
				cached
			});
			declarations.set(planned.nodeId, planned);
		}
		const name = declaration.children().first();
		for (const reference of module
			.walk()
			.references()
			.where((candidate) => candidate.variable === entry.variable)) {
			if (!reference.node.span || (name && within(reference, name))) continue;
			const site = Object.freeze({
				nodeId: reference.node.id,
				start: reference.node.span.start,
				end: reference.node.span.end,
				variableId: entry.variable.id,
				initializerStart: initializer.node.span.start,
				initializerEnd: initializer.node.span.end,
				initializerNodeId: initializer.node.id,
				cached
			});
			sites.set(site.nodeId, site);
		}
	}
	return Object.freeze({ sites, declarations });
}

function variableDeclaration(module: BoundModule, variable: Variable): NodeRef | undefined {
	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const name = declaration.children().first();
		if (
			name
				?.walk()
				.references()
				.any((reference) => reference.variable === variable)
		)
			return declaration;
	}
	return undefined;
}

function within(reference: NodeRef, owner: NodeRef): boolean {
	return (
		reference.node === owner.node ||
		reference.ancestors().any((ancestor) => ancestor.node === owner.node)
	);
}
