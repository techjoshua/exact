import type { BoundModule, NodeRef } from '@exact/expressions';

import type { ExactContextEffect, ExactStateEffect } from '../types.js';

import { type expressionComponentIndex } from './component-index.js';

/** Collects state aliases in deterministic order. */
export function collectStateAliases(
	module: BoundModule,
	work: NodeRef
): ReadonlyMap<string, readonly string[]> {
	const aliases = new Map<string, readonly string[]>();
	for (const declaration of work.walk().ofKind('VariableDeclaration')) {
		const children = declaration.children().toArray();
		const initializer = children.at(-1);
		const path = initializer ? statePath(module, initializer, aliases) : undefined;
		if (!path) continue;
		if (children[0]) bindPattern(children[0], path, aliases);
	}
	return aliases;
}

function bindPattern(
	pattern: NodeRef,
	base: readonly string[],
	aliases: Map<string, readonly string[]>
): void {
	if (pattern.node.kind === 'Identifier') {
		if (pattern.variable && !pattern.variable.mutable) aliases.set(pattern.variable.id, base);
		return;
	}
	const bindings =
		pattern.node.kind === 'BindingElement'
			? [pattern]
			: pattern
					.children()
					.where((child) => child.node.kind === 'BindingElement')
					.toArray();
	bindings.forEach((binding, index) => {
		const children = binding.children().toArray();
		const name = [...children]
			.reverse()
			.find(
				(child) =>
					child.node.kind === 'Identifier' ||
					child.node.kind === 'ObjectBindingPattern' ||
					child.node.kind === 'ArrayBindingPattern'
			);
		if (!name) return;
		const identifiers = children.filter((child) => child.node.kind === 'Identifier');
		const segment =
			pattern.node.kind === 'ArrayBindingPattern'
				? String(index)
				: identifiers.length > 1
					? identifiers[0]!.name
					: name.name;
		bindPattern(name, [...base, segment ?? '*'], aliases);
	});
}

/** Performs the state path domain operation. */
export function statePath(
	module: BoundModule,
	reference: NodeRef,
	aliases: ReadonlyMap<string, readonly string[]>
): readonly string[] | undefined {
	const text = reference.node.text?.trim();
	if (!text) return undefined;
	const direct = parsePath(text, 'this.state');
	if (direct) return direct;
	const root = reference.walk().references().first()?.variable;
	const base = root ? aliases.get(root.id) : undefined;
	if (!base || !root) return undefined;
	const suffix = parsePath(text, root.name);
	return suffix ? [...base, ...suffix] : undefined;
}

function parsePath(text: string, root: string): readonly string[] | undefined {
	if (text === root) return [];
	if (!text.startsWith(root)) return undefined;
	const suffix = text.slice(root.length);
	const segments: string[] = [];
	const pattern = /\.([A-Za-z_$][\w$]*)|\[\s*(?:(["'])(.*?)\2|(\d+)|[^\]]+)\s*\]/g;
	let end = 0;
	for (const match of suffix.matchAll(pattern)) {
		if (match.index !== end) return undefined;
		segments.push(match[1] ?? match[3] ?? match[4] ?? '*');
		end = match.index + match[0].length;
	}
	return end === suffix.length ? segments : undefined;
}

/** Performs the inside assignment target domain operation. */
export function insideAssignmentTarget(reference: NodeRef): boolean {
	for (const assignment of reference.ancestors().assignments()) {
		const left = assignment.children().first();
		if (left && isWithin(reference, left)) return true;
	}
	return false;
}

/** Reports whether within. */
export function isWithin(reference: NodeRef, owner: NodeRef): boolean {
	return (
		reference.node === owner.node ||
		reference.ancestors().any((ancestor) => ancestor.node === owner.node)
	);
}

/** Performs the effect domain operation. */
export function effect(path: string, kind: 'read' | 'write', broad = false): ExactStateEffect {
	return Object.freeze({ path, kind, confidence: broad || path.includes('*') ? 'broad' : 'exact' });
}

/** Performs the unique effects domain operation. */
export function uniqueEffects(effects: readonly ExactStateEffect[]): ExactStateEffect[] {
	return [
		...new Map(
			effects.filter((value) => value.path).map((value) => [`${value.kind}:${value.path}`, value])
		).values()
	];
}

/** Performs the unique contexts domain operation. */
export function uniqueContexts(effects: readonly ExactContextEffect[]): ExactContextEffect[] {
	return [...new Map(effects.map((value) => [`${value.kind}:${value.token}`, value])).values()];
}

/** Reports whether task call. */
export function isTaskCall(
	call: NodeRef,
	components?: ReturnType<typeof expressionComponentIndex>
): boolean {
	const target = call.target;
	const taskTarget =
		target?.isMember('client') || target?.isMember('server') ? target.target : target;
	if (!taskTarget?.isMember('task')) return false;
	if (!components) return true;
	return components.ownsReceiver(components.owner(call), taskTarget.rootVariable);
}

/** Performs the task component owner domain operation. */
export function taskComponentOwner(
	task: NodeRef,
	components: ReturnType<typeof expressionComponentIndex>
): NodeRef | undefined {
	const receiver = task.target?.rootVariable;
	const owner = components.owner(task);
	return components.ownsReceiver(owner, receiver) ? owner : undefined;
}

/** Reports whether function. */
export function isFunction(reference: NodeRef): boolean {
	return reference.node.kind === 'ArrowFunction' || reference.node.kind === 'FunctionExpression';
}
