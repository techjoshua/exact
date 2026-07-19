import type { BoundModule, NodeRef, Variable } from '@exact/expressions';

import { exactCleanupForCall, exactOwnsReturn } from '../annotations.js';

import type { ExactEnvironmentEffectSourceIR } from '../types.js';

import type {
	ExpressionTaskResourceDisposal,
	ExpressionTaskResourceKind
} from './task-contracts.js';

import { isTaskCall, isWithin } from './task-state.js';

/** Performs the effect path suffix domain operation. */
export function effectPathSuffix(sources: readonly ExactEnvironmentEffectSourceIR[]): string {
	const candidate = sources.find((source) => source.environment === 'unknown') ?? sources[0];
	return candidate?.path.length ? ` (${candidate.path.join(' → ')})` : '';
}

/** Performs the module local variables domain operation. */
export function moduleLocalVariables(module: BoundModule): Set<Variable> {
	return new Set(
		module
			.walk()
			.references()
			.toArray()
			.map((reference) => reference.variable)
			// Scope objects for declarations from lib.d.ts are projected into the
			// current module's scope graph so that references remain navigable.  The
			// canonical declaration identity, unlike that projected scope, retains the
			// declaration's real source file and is therefore the reliable locality
			// test.
			.filter(
				(variable): variable is Variable =>
					!!variable && variable.id.startsWith(`${module.filename}:`)
			)
	);
}

/** Reports whether owned listener. */
export function isOwnedListener(call: NodeRef, localVariables: ReadonlySet<Variable>): boolean {
	if (!call.target?.isMember('addEventListener')) return false;
	const receiver = call.target.target;
	const root = receiver?.rootVariable;
	const name = root?.name ?? receiver?.name ?? receiver?.node.text;
	if (
		!!name &&
		['window', 'document', 'globalThis'].includes(name) &&
		(!root || !localVariables.has(root))
	)
		return true;
	// EventTarget-compatible APIs expose an options parameter containing signal.
	return taskSignalCall(call, localVariables)?.mode === 'options';
}

/** Performs the direct setup expression domain operation. */
export function directSetupExpression(call: NodeRef): NodeRef | undefined {
	const statement = call.ancestors().ofKind('ExpressionStatement').first();
	if (!statement) return undefined;
	// Only own a whole direct setup expression. Calls nested in callbacks have a
	// nearer function owner and never reach this point; initializers deliberately
	// remain explicit because replacing their value with a task handle is invalid.
	return statement.children().first();
}

/** Performs the inside task domain operation. */
export function insideTask(reference: NodeRef): boolean {
	return reference.ancestors().calls().any(isTaskCall);
}

/** Performs the inside client jsx domain operation. */
export function insideClientJsx(reference: NodeRef): boolean {
	return reference
		.ancestors()
		.ofKind('JsxAttribute')
		.any((attribute) =>
			/^(?:on[A-Z]|ref)\b/.test(attribute.node.name ?? attribute.node.text ?? '')
		);
}

/** Performs the task resource domain operation. */
export function taskResource(
	call: NodeRef,
	localVariables: ReadonlySet<Variable>
):
	| Readonly<{
			kind: ExpressionTaskResourceKind;
			disposal?: ExpressionTaskResourceDisposal;
			description?: string;
	  }>
	| undefined {
	const target = call.target;
	const name = target?.name ?? target?.node.text?.trim();
	const variable = target?.rootVariable ?? target?.variable;
	if (
		variable &&
		localVariables.has(variable) &&
		[
			'MutationObserver',
			'ResizeObserver',
			'IntersectionObserver',
			'WebSocket',
			'EventSource',
			'BroadcastChannel',
			'Worker',
			'setTimeout',
			'setInterval',
			'requestAnimationFrame',
			'requestIdleCallback',
			'fetch'
		].includes(name ?? '')
	)
		return undefined;
	if (
		call.node.kind === 'NewExpression' &&
		['MutationObserver', 'ResizeObserver', 'IntersectionObserver'].includes(name ?? '')
	)
		return { kind: 'observer' };
	if (
		call.node.kind === 'NewExpression' &&
		['WebSocket', 'EventSource', 'BroadcastChannel'].includes(name ?? '')
	)
		return { kind: 'owned', disposal: 'close', description: name };
	if (call.node.kind === 'NewExpression' && name === 'Worker')
		return { kind: 'owned', disposal: 'terminate', description: name };
	if (name === 'setTimeout') return { kind: 'timeout' };
	if (name === 'setInterval') return { kind: 'interval' };
	if (name === 'requestAnimationFrame') return { kind: 'animation-frame' };
	if (name === 'requestIdleCallback') return { kind: 'idle-callback' };
	if (name === 'fetch') return { kind: 'fetch' };
	if (call.target?.isMember('subscribe')) {
		const disposal = disposalForSubscription(call.type);
		if (disposal) return { kind: 'owned', disposal, description: 'subscription' };
	}
	const annotatedCleanup = exactCleanupForCall(call);
	if (annotatedCleanup)
		return {
			kind: 'owned',
			disposal: annotatedCleanup,
			description: call.type?.display ?? 'annotated resource'
		};
	if (exactOwnsReturn(call) && call.type?.callable)
		return { kind: 'owned', disposal: 'call', description: 'owned cleanup function' };
	if (isDisposableType(call.type))
		return { kind: 'owned', description: call.type?.display ?? 'disposable resource' };
	return undefined;
}

/** Performs the task signal call domain operation. */
export function taskSignalCall(
	call: NodeRef,
	localVariables: ReadonlySet<Variable>
): Readonly<{ parameter: number; mode: 'direct' | 'options'; eventOptions?: boolean }> | undefined {
	if (isTaskCall(call)) return undefined;
	if (isKnownGlobalListener(call, localVariables))
		return { parameter: 2, mode: 'options', eventOptions: true };
	const target = call.target;
	const variable = target?.rootVariable ?? target?.variable;
	const name = target?.name ?? target?.node.text?.trim();
	const signatures = call.node.resolvedSignature
		? [call.node.resolvedSignature]
		: (target?.type?.callSignatures ?? []);
	for (const signature of signatures) {
		for (let index = 0; index < signature.parameters.length; index++) {
			const parameter = signature.parameters[index]!;
			const mode = acceptsAbortSignal(parameter.type)
				? 'direct'
				: hasAbortSignalOption(parameter.type)
					? 'options'
					: undefined;
			if (!mode || parameter.rest || (index >= call.arguments.length && !parameter.optional))
				continue;
			if (
				signature.parameters
					.slice(call.arguments.length, index)
					.some((candidate) => !candidate.optional)
			)
				continue;
			return { parameter: index, mode };
		}
	}
	// Some lightweight projects omit DOM overloads. Preserve canonical fetch cancellation.
	if (name === 'fetch' && (!variable || !localVariables.has(variable)))
		return { parameter: 1, mode: 'options' };
	return undefined;
}

function isKnownGlobalListener(call: NodeRef, localVariables: ReadonlySet<Variable>): boolean {
	if (!call.target?.isMember('addEventListener')) return false;
	const receiver = call.target.target;
	const root = receiver?.rootVariable;
	const name = root?.name ?? receiver?.name ?? receiver?.node.text;
	return (
		!!name &&
		['window', 'document', 'globalThis'].includes(name) &&
		(!root || !localVariables.has(root))
	);
}

function acceptsAbortSignal(type: NonNullable<NodeRef['type']>): boolean {
	if (type.unionMembers.length)
		return type.unionMembers.some((member) => acceptsAbortSignal(member));
	return /(?:^|\W)AbortSignal(?:$|\W)/.test(type.display) && !type.properties.includes('signal');
}

function hasAbortSignalOption(type: NonNullable<NodeRef['type']>): boolean {
	const signal = type.propertyTypes.find((property) => property.name === 'signal');
	if (signal && acceptsAbortSignal(signal.type)) return true;
	return type.unionMembers.some((member) => hasAbortSignalOption(member));
}

function disposalForSubscription(
	type: NodeRef['type']
): ExpressionTaskResourceDisposal | undefined {
	if (!type) return undefined;
	if (type.callable) return 'call';
	if (type.properties.includes('unsubscribe')) return 'unsubscribe';
	if (type.properties.includes('dispose')) return 'dispose';
	return type.unionMembers
		.map(disposalForSubscription)
		.find((value): value is ExpressionTaskResourceDisposal => !!value);
}

function isDisposableType(type: NodeRef['type']): boolean {
	if (!type) return false;
	return (
		/\b(?:Async)?Disposable\b/.test(type.display) ||
		type.properties.some((property) => /(?:async)?dispose/i.test(property)) ||
		type.unionMembers.some(isDisposableType)
	);
}

/** Performs the task resource ownership domain operation. */
export function taskResourceOwnership(
	module: BoundModule,
	work: NodeRef,
	call: NodeRef,
	resource: Readonly<{ disposal?: ExpressionTaskResourceDisposal }>
): 'owned' | 'explicit' | 'escape' {
	const declaration = call.ancestors().ofKind('VariableDeclaration').first();
	const variable = declaration?.children().first()?.walk().references().first()?.variable;
	if (!declaration || !variable) return resourceEscapesDirectly(call) ? 'escape' : 'owned';
	let explicit = false;
	for (const reference of work
		.walk()
		.references()
		.where((candidate) => candidate.variable === variable)) {
		if (isWithin(reference, declaration)) continue;
		const member = reference.parent?.isMember() ? reference.parent : undefined;
		if (member?.target?.node === reference.node) {
			const method = member.name ?? '';
			if (
				[resource.disposal, 'close', 'terminate', 'unsubscribe', 'dispose', 'cancel'].includes(
					method as ExpressionTaskResourceDisposal
				)
			) {
				if (member.parent?.node.kind === 'CallExpression') explicit = true;
			}
			continue;
		}
		const parent = reference.parent;
		if (
			parent?.node.kind === 'CallExpression' &&
			parent.target?.node === reference.node &&
			resource.disposal === 'call'
		) {
			explicit = true;
			continue;
		}
		if (ancestorWithin(reference, work, (ancestor) => ancestor.node.kind === 'ReturnStatement')) {
			if (resource.disposal === 'call') {
				explicit = true;
				continue;
			}
			return 'escape';
		}
		if (
			ancestorWithin(
				reference,
				work,
				(ancestor) =>
					ancestor.node.kind === 'CallExpression' || ancestor.node.kind === 'NewExpression'
			) ||
			ancestorWithin(
				reference,
				work,
				(ancestor) => ancestor.node.kind === 'BinaryExpression' && ancestor.node.operator === '='
			) ||
			ancestorWithin(
				reference,
				work,
				(ancestor) =>
					ancestor.node.kind === 'PropertyAssignment' ||
					ancestor.node.kind === 'ArrayLiteralExpression'
			)
		)
			return 'escape';
	}
	void module;
	return explicit ? 'explicit' : 'owned';
}

function ancestorWithin(
	reference: NodeRef,
	owner: NodeRef,
	predicate: (ancestor: NodeRef) => boolean
): NodeRef | undefined {
	for (const ancestor of reference.ancestors()) {
		if (ancestor.node === owner.node) break;
		if (predicate(ancestor)) return ancestor;
	}
	return undefined;
}

function resourceEscapesDirectly(call: NodeRef): boolean {
	const parent = call.parent;
	if (!parent) return true;
	if (parent.isMember() && parent.target?.node === call.node) return false;
	return !['ExpressionStatement', 'AwaitExpression'].includes(parent.node.kind);
}
