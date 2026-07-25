import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import type { ExactProvenanceGraph, ExactReactiveProvenance } from '../provenance.js';

import { insideAssignmentTarget } from './task-state.js';

/** One compiler-captured value and the authored read sites replaced by that value. */
export interface ExpressionTaskDependency {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly source: 'state' | 'props' | 'context' | 'derived';
	readonly readNodeIds: readonly string[];
}

/** Result of planning executable task captures independently from effect metadata. */
export interface ExpressionTaskDependencyAnalysis {
	readonly dependencies: readonly ExpressionTaskDependency[];
	readonly unsafeDerived: readonly Variable[];
}

interface Candidate {
	readonly expression: NodeRef;
	readonly source: ExpressionTaskDependency['source'];
}

/**
 * Plans exact task capture expressions and their callback substitutions.
 *
 * Effect paths may contain broad wildcard segments, but emitted JavaScript must
 * retain the authored expression. Candidates therefore preserve canonical node
 * identities and never reconstruct executable reads from effect metadata.
 */
export function analyzeTaskDependencies(
	module: BoundModule,
	work: NodeRef,
	provenance: ExactProvenanceGraph
): ExpressionTaskDependencyAnalysis {
	const candidates: Candidate[] = [];
	const unsafeDerived = new Map<string, Variable>();

	for (const member of work.walk().memberAccesses()) {
		if (insideAssignmentTarget(member)) continue;
		const expression = capturedMemberExpression(member);
		if (!expression?.node.span) continue;
		const variable = expression.rootVariable;
		if (variable && declaredWithin(module, variable, work)) continue;
		const entry = variable ? provenance.get(variable) : undefined;
		const source = dependencySource(entry?.provenance);
		if (!source) continue;
		if (entry?.provenance === 'derived' && !entry.safeToReevaluate) {
			unsafeDerived.set(variable!.id, variable!);
			continue;
		}
		candidates.push({ expression, source });
	}

	for (const reference of work.walk().references()) {
		const variable = reference.variable;
		if (
			!variable ||
			!reference.node.span ||
			nestedInMemberReceiver(reference) ||
			declaredWithin(module, variable, work)
		)
			continue;
		const entry = provenance.get(variable);
		const source = dependencySource(entry?.provenance);
		if (!source) continue;
		if (entry?.provenance === 'derived' && !entry.safeToReevaluate) {
			unsafeDerived.set(variable.id, variable);
			continue;
		}
		candidates.push({ expression: reference, source });
	}

	// A capture such as state.values[state.key] already tracks its key expression.
	// Nested candidates are retained only when they also occur independently.
	const exposed = candidates.filter(
		(candidate) =>
			!candidates.some(
				(container) =>
					container !== candidate &&
					contains(container.expression, candidate.expression) &&
					container.expression.node.span?.start !== candidate.expression.node.span?.start
			)
	);
	const grouped = new Map<string, Candidate[]>();
	for (const candidate of exposed) {
		const key = `${candidate.source}:${candidate.expression.node.text?.trim() ?? candidate.expression.node.id}`;
		const values = grouped.get(key) ?? [];
		values.push(candidate);
		grouped.set(key, values);
	}
	const dependencies = [...grouped.values()]
		.map((values) => {
			const first = values[0]!;
			const span = first.expression.node.span!;
			return Object.freeze({
				nodeId: first.expression.node.id,
				start: span.start,
				end: span.end,
				source: first.source,
				readNodeIds: Object.freeze([...new Set(values.map((value) => value.expression.node.id))])
			});
		})
		.sort((left, right) => left.start - right.start);
	return Object.freeze({
		dependencies: Object.freeze(dependencies),
		unsafeDerived: Object.freeze([...unsafeDerived.values()])
	});
}

function capturedMemberExpression(member: NodeRef): NodeRef | undefined {
	const parent = member.parent;
	if (
		parent?.node.kind === 'CallExpression' &&
		parent.target?.node === member.node &&
		member.target
	)
		return member.target;
	if (parent?.isMember() && parent.target?.node === member.node) return undefined;
	return member;
}

function nestedInMemberReceiver(reference: NodeRef): boolean {
	return reference.parent?.isMember() === true && reference.parent.target?.node === reference.node;
}

function dependencySource(
	provenance: ExactReactiveProvenance | undefined
): ExpressionTaskDependency['source'] | undefined {
	return provenance === 'state' ||
		provenance === 'props' ||
		provenance === 'context' ||
		provenance === 'derived'
		? provenance
		: undefined;
}

function contains(container: NodeRef, candidate: NodeRef): boolean {
	const outer = container.node.span;
	const inner = candidate.node.span;
	return !!outer && !!inner && outer.start <= inner.start && outer.end >= inner.end;
}

function declaredWithin(module: BoundModule, variable: Variable, work: NodeRef): boolean {
	return module
		.walk()
		.references()
		.where((reference) => reference.variable === variable)
		.any((reference) => {
			const declaration = reference
				.ancestors()
				.first((ancestor) => ancestor.node.kind === variable.declarationKind);
			return !!declaration && contains(work, declaration);
		});
}
