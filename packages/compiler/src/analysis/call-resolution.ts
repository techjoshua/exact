import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { hasExactDirective } from '../annotations.js';
import { isUnshadowedPlatformGlobal } from '../platform-effects.js';
import type { ExactSemanticGraphIR } from '../types.js';

import type { MutableCallable } from './callable-state.js';
/** Performs the client boundary function domain operation. */
export function clientBoundaryFunction(reference: NodeRef): boolean {
	const attribute = reference.ancestors().ofKind('JsxAttribute').first();
	return (
		!!attribute && (attribute.node.name === 'ref' || /^on[A-Z]/.test(attribute.node.name ?? ''))
	);
}

/** Performs the task owner domain operation. */
export function taskOwner(fn: NodeRef): NodeRef | undefined {
	const call = fn.parent?.node.kind === 'CallExpression' ? fn.parent : undefined;
	return call && /^this\.task(?:\.(?:client|server))?\s*\(/.test(call.node.text ?? '')
		? call
		: undefined;
}

/** Performs the declaration variable domain operation. */
export function declarationVariable(fn: NodeRef): Variable | undefined {
	if (fn.node.kind === 'FunctionDeclaration' || fn.node.kind === 'MethodDeclaration') {
		return fn
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.first()?.variable;
	}
	const declaration = fn.ancestors().ofKind('VariableDeclaration').first();
	return declaration?.children().first()?.variable;
}

/** Performs the callable name domain operation. */
export function callableName(fn: NodeRef, variable: Variable | undefined): string {
	return variable?.name ?? fn.node.name ?? `<function@${fn.node.span?.start ?? 0}>`;
}

/** Performs the exported names by variable domain operation. */
export function exportedNamesByVariable(
	module: BoundModule,
	graph: ExactSemanticGraphIR
): Map<string, string[]> {
	const result = new Map<string, string[]>();
	const add = (variable: Variable | undefined, name: string | undefined) => {
		if (!variable || !name) return;
		const names = result.get(variable.id) ?? [];
		if (!names.includes(name)) names.push(name);
		result.set(variable.id, names);
	};
	const declarations = new Map(
		graph.declarations.map((declaration) => [declaration.id, declaration])
	);
	for (const reference of module
		.walk()
		.where((candidate) => candidate.node.kind === 'Identifier')) {
		const declaration = reference.variable ? declarations.get(reference.variable.id) : undefined;
		if (declaration?.exportedName && !declaration.typeOnly)
			add(reference.variable, declaration.exportedName);
	}
	for (const specifier of module.walk().ofKind('ExportSpecifier')) {
		if (
			/\btype\b/.test(specifier.node.text ?? '') ||
			specifier
				.ancestors()
				.first((ancestor) => ancestor.node.kind === 'ExportDeclaration')
				?.node.text?.match(/\bfrom\s*["']/)
		)
			continue;
		const identifiers = specifier
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		const local = identifiers.length > 1 ? identifiers[0] : identifiers.at(-1);
		add(local?.variable, identifiers.at(-1)?.name);
	}
	for (const names of result.values()) names.sort();
	return result;
}

/** Performs the nearest function domain operation. */
export function nearestFunction(reference: NodeRef): NodeRef | undefined {
	return reference.ancestors().functions().first();
}

/** Runs variable with the supplied execution context. */
export function callVariable(call: NodeRef): Variable | undefined {
	const targetVariable = call.target?.variable;
	const rootVariable = call.target?.rootVariable;
	if (
		rootVariable?.importedFrom &&
		(!targetVariable?.importedFrom || targetVariable === rootVariable)
	)
		return rootVariable;
	return targetVariable ?? rootVariable;
}

/** Performs the unresolved call effect domain operation. */
export function unresolvedCallEffect(
	call: NodeRef,
	localVariables: ReadonlySet<Variable>
): 'browser' | 'server' | 'unknown' | undefined {
	const directives = call.node.resolvedSignature?.directives;
	if (hasExactDirective(directives, 'client')) return 'browser';
	if (hasExactDirective(directives, 'server')) return 'server';
	const targetText = call.target?.node.text?.trim() ?? '';
	if (
		/^this\.(?:task(?:\.(?:client|server))?|map|getContext|setContext|prop|ref|reactive)$/.test(
			targetText
		)
	)
		return undefined;
	const receiver = call.target?.isMember() ? call.target.target : call.target;
	const rootVariable =
		receiver?.rootVariable ??
		receiver?.variable ??
		call.target?.rootVariable ??
		call.target?.variable;
	const rootName = rootVariable?.name ?? receiver?.name ?? call.target?.name;
	const platform = isUnshadowedPlatformGlobal(rootName, rootVariable, localVariables);
	if (platform) return platform;
	if (rootName && universalCallRoots.has(rootName)) return undefined;
	const receiverType = call.target?.target?.type?.display ?? '';
	if (
		/\b(?:AbortController|AbortSignal|Array|Headers|Map|Promise|Request|Response|Set|URL|URLSearchParams|WeakMap|WeakSet)\b|\[\](?:\s|$)/.test(
			receiverType
		)
	)
		return undefined;
	const declaration = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, '/') ?? '';
	if (/\/typescript\/lib\/lib\.(?:dom|webworker)(?:\.[^/]*)?\.d\.ts$/i.test(declaration))
		return 'browser';
	if (/\/typescript\/lib\/lib\.[^/]+\.d\.ts$/i.test(declaration)) return undefined;
	if (
		/(?:^|\/)@types\/node\//.test(declaration) ||
		/\/node_modules\/(?:node:)?(?:fs|path|crypto|http|https|net|tls|child_process)\//.test(
			declaration
		)
	)
		return 'server';
	if (/(?:^|\/)(?:@exact|packages)\/hydrate\//.test(declaration)) return 'browser';
	if (
		/(?:^|\/)(?:@exact|packages)\/dom\//.test(declaration) &&
		/^(?:render|unmount|dispose|adoptStatic|adoptComponentRoot|adoptMarkerlessComponentRoot|findComponentDomNode|disposeOwnedSubtree)$/.test(
			call.target?.name ?? ''
		)
	)
		return 'browser';
	if (/(?:^|\/)(?:@exact|packages)\/(?:core|dom|reactive|request)(?:\/|$)/.test(declaration))
		return undefined;
	return 'unknown';
}

const universalCallRoots = new Set([
	'Array',
	'BigInt',
	'Boolean',
	'Date',
	'Error',
	'EvalError',
	'Intl',
	'JSON',
	'Map',
	'Math',
	'Number',
	'Object',
	'Promise',
	'RangeError',
	'ReferenceError',
	'Reflect',
	'RegExp',
	'Set',
	'String',
	'Symbol',
	'SyntaxError',
	'TypeError',
	'URIError',
	'URL',
	'URLSearchParams',
	'WeakMap',
	'WeakSet',
	'clearInterval',
	'clearTimeout',
	'decodeURI',
	'decodeURIComponent',
	'encodeURI',
	'encodeURIComponent',
	'fetch',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'console',
	'peek',
	'queueMicrotask',
	'setInterval',
	'setTimeout',
	'structuredClone'
]);

/** Performs the local call target domain operation. */
export function localCallTarget(
	call: NodeRef,
	callables: ReadonlyMap<string, MutableCallable>,
	initializers: ReadonlyMap<string, MutableCallable>,
	nodes: ReadonlyMap<string, MutableCallable>
): MutableCallable | undefined {
	for (const variable of [call.target?.variable, call.target?.rootVariable]) {
		if (!variable) continue;
		const target = callables.get(variable.id) ?? initializers.get(variable.id);
		if (target) return target;
	}
	return call.target ? nodes.get(call.target.node.id) : undefined;
}
