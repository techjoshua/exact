import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { expressionStatePath } from '../expression/writes.js';
import type {
	ExactCallableSummaryIR,
	ExactCallEdgeIR,
	ExactContextEffect,
	ExactStateEffect
} from '../types.js';

import type { MutableCallable } from './callable-state.js';
/** Performs the unique state effects domain operation. */
export function uniqueStateEffects(values: readonly ExactStateEffect[]): ExactStateEffect[] {
	return [
		...new Map(
			values.map((value) => [
				`${value.kind}:${value.path}:${value.confidence}:${stateReceiverKey(value)}`,
				value
			])
		).values()
	].sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

/** Performs the state receiver key domain operation. */
export function stateReceiverKey(value: ExactStateEffect): string {
	return value.receiver?.kind === 'parameter'
		? `parameter:${value.receiver.index}`
		: (value.receiver?.kind ?? 'component');
}

/** Performs the receiver binding field domain operation. */
export function receiverBindingField(
	call: NodeRef,
	caller: MutableCallable,
	local: MutableCallable | undefined,
	external: ExactCallableSummaryIR | undefined
): Pick<ExactCallEdgeIR, 'receiverBindings'> | Record<string, never> {
	const indices = local
		? local.parameters.map((_, index) => index)
		: [
				...new Set(
					[...(external?.stateReads ?? []), ...(external?.stateWrites ?? [])].flatMap((effect) =>
						effect.receiver?.kind === 'parameter' ? [effect.receiver.index] : []
					)
				)
			];
	if (!indices.length) return {};
	return {
		receiverBindings: indices.map((parameterIndex) => {
			const argument = call.arguments[parameterIndex];
			if (argument?.node.kind === 'ThisKeyword')
				return { parameterIndex, source: 'component' as const };
			const argumentVariable = argument?.variable ?? argument?.rootVariable;
			const sourceParameterIndex = argumentVariable
				? caller.parameters.findIndex((parameter) => parameter.id === argumentVariable.id)
				: -1;
			return sourceParameterIndex >= 0
				? { parameterIndex, source: 'parameter' as const, sourceParameterIndex }
				: { parameterIndex, source: 'unknown' as const };
		})
	};
}

/** Performs the map state effects domain operation. */
export function mapStateEffects(
	effects: readonly ExactStateEffect[],
	edge: ExactCallEdgeIR
): ExactStateEffect[] {
	return effects.map((effect) => {
		if (effect.receiver?.kind !== 'parameter') return effect;
		const parameterIndex = effect.receiver.index;
		const binding = edge.receiverBindings?.find(
			(candidate) => candidate.parameterIndex === parameterIndex
		);
		if (binding?.source === 'component') return { ...effect, receiver: { kind: 'component' } };
		if (binding?.source === 'parameter')
			return { ...effect, receiver: { kind: 'parameter', index: binding.sourceParameterIndex! } };
		return {
			...effect,
			path: effect.path || '*',
			confidence: 'unknown',
			receiver: { kind: 'unknown' }
		};
	});
}

/** Performs the parameter state effect domain operation. */
export function parameterStateEffect(
	member: NodeRef,
	parameters: readonly Variable[]
): Omit<ExactStateEffect, 'kind'> | undefined {
	if (!member.isMember()) return undefined;
	if (member.parent?.isMember() && member.parent.target?.node === member.node) return undefined;
	const parameterIndex = member.rootVariable
		? parameters.findIndex((parameter) => parameter.id === member.rootVariable!.id)
		: -1;
	if (parameterIndex < 0) return undefined;
	const segments: string[] = [];
	let current: NodeRef | undefined = member;
	while (current?.isMember()) {
		if (!current.name)
			return {
				path: '*',
				confidence: 'unknown',
				receiver: { kind: 'parameter', index: parameterIndex }
			};
		segments.unshift(current.name);
		current = current.target;
	}
	if (segments[0] !== 'state') return undefined;
	segments.shift();
	if (
		member.parent?.node.kind === 'CallExpression' &&
		member.parent.target?.node === member.node &&
		arrayStateMutators.has(segments.at(-1) ?? '')
	)
		segments.pop();
	return {
		path: segments.join('.') || '*',
		confidence: segments.length ? 'exact' : 'broad',
		receiver: { kind: 'parameter', index: parameterIndex }
	};
}

const arrayStateMutators = new Set([
	'push',
	'pop',
	'shift',
	'unshift',
	'splice',
	'sort',
	'reverse',
	'copyWithin',
	'fill'
]);
const intrinsicCollectionMethods = new Set([
	...arrayStateMutators,
	'at',
	'concat',
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flat',
	'flatMap',
	'forEach',
	'includes',
	'indexOf',
	'join',
	'lastIndexOf',
	'map',
	'reduce',
	'reduceRight',
	'slice',
	'some',
	'toReversed',
	'toSorted',
	'toSpliced',
	'with'
]);

/** Reports whether compiler owned collection call. */
export function isCompilerOwnedCollectionCall(
	module: BoundModule,
	call: NodeRef,
	aliases: ReadonlyMap<string, readonly string[]>
): boolean {
	if (!call.target?.isMember() || !intrinsicCollectionMethods.has(call.target.name ?? ''))
		return false;
	return isCompilerOwnedCollectionReceiver(module, call.target.target, aliases);
}

/**
 * Reports whether a call resolves to the side-effect-neutral ECMAScript library.
 *
 * DOM declarations are deliberately excluded: being built in does not make a
 * browser API portable or effect free.
 */
export function isIntrinsicLanguageCall(call: NodeRef): boolean {
	const declaration = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, '/');
	return (
		!!declaration &&
		/(?:\/typescript|\/@typescript\/[^/]+)\/lib\/lib\.es[^/]*\.d\.ts$/i.test(declaration)
	);
}

/** Reports whether compiler owned collection receiver. */
export function isCompilerOwnedCollectionReceiver(
	module: BoundModule,
	receiver: NodeRef | undefined,
	aliases: ReadonlyMap<string, readonly string[]>
): boolean {
	if (!receiver) return false;
	if (expressionStatePath(module, receiver.node, aliases) !== undefined) return true;
	if (
		receiver.node.kind !== 'CallExpression' ||
		!receiver.target?.isMember() ||
		!intrinsicCollectionMethods.has(receiver.target.name ?? '')
	)
		return false;
	return isCompilerOwnedCollectionReceiver(module, receiver.target.target, aliases);
}

/** Reports whether state write. */
export function isStateWrite(member: NodeRef): boolean {
	const parent = member.parent;
	if (!parent) return false;
	if (
		parent.node.kind === 'BinaryExpression' &&
		parent.node.children[0] === member.node &&
		/^(?:=|\+=|-=|\*=|\/=|%=|&&=|\|\|=|\?\?=)$/.test(parent.node.operator ?? '')
	)
		return true;
	if (
		['PrefixUnaryExpression', 'PostfixUnaryExpression', 'DeleteExpression'].includes(
			parent.node.kind
		)
	)
		return true;
	return (
		parent.node.kind === 'CallExpression' &&
		parent.target?.node === member.node &&
		arrayStateMutators.has(member.name ?? '')
	);
}

/** Performs the unique context effects domain operation. */
export function uniqueContextEffects(values: readonly ExactContextEffect[]): ExactContextEffect[] {
	return [
		...new Map(
			values.map((value) => [`${value.kind}:${value.token}:${value.confidence}`, value])
		).values()
	].sort((left, right) =>
		`${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`)
	);
}

/** Performs the known higher order call domain operation. */
export function knownHigherOrderCall(call: NodeRef): boolean {
	const name = call.target?.name;
	return (
		!!name &&
		new Set([
			'map',
			'flatMap',
			'filter',
			'forEach',
			'some',
			'every',
			'find',
			'findIndex',
			'findLast',
			'findLastIndex',
			'reduce',
			'reduceRight',
			'sort',
			'then',
			'catch',
			'finally'
		]).has(name)
	);
}

/** Reports whether function node. */
export function isFunctionNode(reference: NodeRef): boolean {
	return (
		reference.node.kind === 'ArrowFunction' ||
		reference.node.kind === 'FunctionExpression' ||
		reference.node.kind === 'FunctionDeclaration'
	);
}

export { effectFor } from './effect-lattice.js';
