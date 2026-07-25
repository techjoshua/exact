import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { hasExactDirective, trackedCallbackArguments } from '../annotations.js';

const safeCollectionMethods = new Set([
	'at',
	'filter',
	'map',
	'flatMap',
	'slice',
	'concat',
	'includes',
	'indexOf',
	'lastIndexOf',
	'toSorted',
	'toReversed',
	'toSpliced',
	'with',
	'reduce',
	'reduceRight',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'some',
	'every',
	'join'
]);
const safeFreshCollectionMutationMethods = new Set([
	'copyWithin',
	'fill',
	'reverse',
	'sort',
	'splice'
]);
const callbackCollectionMethods = new Set([
	'filter',
	'map',
	'flatMap',
	'reduce',
	'reduceRight',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'some',
	'every'
]);
const safeStringMethods = new Set([
	'trim',
	'trimStart',
	'trimEnd',
	'toLowerCase',
	'toUpperCase',
	'includes',
	'startsWith',
	'endsWith',
	'slice',
	'substring',
	'substr',
	'localeCompare'
]);
const safeScalarFunctions = new Set([
	'String',
	'Number',
	'Boolean',
	'BigInt',
	'parseInt',
	'parseFloat',
	'isFinite',
	'isNaN'
]);
const safeConstructors = new Set(['Set', 'Map']);
const safeStaticMethods = new Map([
	['Array', new Set(['isArray'])],
	[
		'Math',
		new Set([
			'abs',
			'acos',
			'acosh',
			'asin',
			'asinh',
			'atan',
			'atan2',
			'atanh',
			'cbrt',
			'ceil',
			'clz32',
			'cos',
			'cosh',
			'exp',
			'expm1',
			'floor',
			'fround',
			'hypot',
			'imul',
			'log',
			'log10',
			'log1p',
			'log2',
			'max',
			'min',
			'pow',
			'round',
			'sign',
			'sin',
			'sinh',
			'sqrt',
			'tan',
			'tanh',
			'trunc'
		])
	],
	['JSON', new Set(['parse', 'stringify'])]
]);

/** Reports whether a collection method supplies reactive callback values. */
export function isReactiveCollectionCallbackMethod(name: string): boolean {
	return callbackCollectionMethods.has(name);
}

/**
 * Reports whether an initializer can be rerun without observable side effects.
 *
 * Local helper calls are followed recursively. Unknown calls, captured writes,
 * asynchronous suspension, mutation-sensitive allocation, and destructive
 * operators remain unsafe unless a narrower intrinsic rule proves otherwise.
 */
export function isSafeDerivedInitializer(
	module: BoundModule,
	initializer: NodeRef,
	resolvingHelpers = new Set<string>(),
	isKnownSafeCall: (call: NodeRef) => boolean = () => false
): boolean {
	for (const effect of module.effectsOf(initializer)) {
		if (effect.kind !== 'write') continue;
		const reference = module.ref(effect.node);
		const callback = reference
			.ancestors()
			.functions()
			.first((fn) => isWithin(fn, initializer));
		if (!callback || module.capturesOf(callback).includes(effect.variable)) return false;
	}
	for (const reference of initializer.walk()) {
		const kind = reference.node.kind;
		if (kind === 'NewExpression') {
			if (
				safeConstructors.has(reference.target?.name ?? '') &&
				isTypeScriptLibraryVariable(reference.target?.rootVariable)
			)
				continue;
			return false;
		}
		if (kind === 'AwaitExpression' || kind === 'YieldExpression' || kind === 'DeleteExpression')
			return false;
		if (
			(kind === 'PrefixUnaryExpression' || kind === 'PostfixUnaryExpression') &&
			(reference.node.operator === '++' || reference.node.operator === '--')
		) {
			const callback = reference
				.ancestors()
				.functions()
				.first((fn) => isWithin(fn, initializer));
			if (!callback) return false;
		}
		if (kind !== 'CallExpression') continue;
		if (isKnownSafeCall(reference)) continue;
		const tracked = trackedCallbackArguments(reference);
		if (tracked.length) {
			if (
				tracked.some(
					(argument) => !['ArrowFunction', 'FunctionExpression'].includes(argument.node.kind)
				)
			)
				return false;
			continue;
		}
		if (
			reference.target?.isMember() &&
			safeStringMethods.has(reference.target.name ?? '') &&
			isTypeScriptLibraryCall(reference)
		)
			continue;
		if (
			reference.target?.isMember() &&
			safeFreshCollectionMutationMethods.has(reference.target.name ?? '') &&
			isFreshCollection(reference.target.target) &&
			isTypeScriptLibraryCall(reference)
		)
			continue;
		if (
			!reference.target?.isMember() &&
			safeScalarFunctions.has(reference.target?.name ?? '') &&
			isTypeScriptLibraryCall(reference)
		)
			continue;
		if (
			reference.target?.isMember() &&
			safeStaticMethods
				.get(reference.target.target?.rootVariable?.name ?? '')
				?.has(reference.target.name ?? '') &&
			isTypeScriptLibraryCall(reference)
		)
			continue;
		if (hasExactDirective(reference.node.resolvedSignature?.directives, 'pure')) continue;
		const helper = localHelper(module, reference);
		if (helper) {
			const helperVariable = reference.target?.rootVariable;
			if (!helperVariable || resolvingHelpers.has(helperVariable.id)) continue;
			const next = new Set(resolvingHelpers);
			next.add(helperVariable.id);
			if (isSafeDerivedInitializer(module, helper, next, isKnownSafeCall)) continue;
		}
		if (
			!reference.target?.isMember() ||
			!safeCollectionMethods.has(reference.target.name ?? '') ||
			!isIntrinsicCollectionCall(reference)
		)
			return false;
	}
	return true;
}

function isFreshCollection(reference: NodeRef | undefined): boolean {
	return reference?.node.kind === 'ArrayLiteralExpression';
}

/**
 * Reports whether a binding is assigned after its declaration.
 *
 * Expression variables describe whether a declaration kind permits mutation;
 * derived inference needs to know whether the program actually performs one.
 */
export function hasWriteAfterDeclaration(
	module: BoundModule,
	variable: Variable,
	binding: NodeRef | undefined
): boolean {
	return module
		.walk()
		.references()
		.where((reference) => reference.variable === variable)
		.any((reference) => {
			if (binding && isWithin(reference, binding)) return false;
			return module
				.effectsOf(reference)
				.some((effect) => effect.kind === 'write' && effect.variable === variable);
		});
}

/**
 * Attributes local helper captures to the values produced by calling them.
 *
 * Function-valued declarations retain ordinary JavaScript identity rather than
 * becoming reactive cells themselves.
 */
export function localHelperCaptures(module: BoundModule, root: NodeRef): readonly Variable[] {
	const captures = new Set<Variable>();
	const visited = new Set<string>();
	const collect = (work: NodeRef): void => {
		for (const call of work.walk().calls()) {
			const helper = localHelper(module, call);
			const variable = call.target?.rootVariable;
			if (!helper || !variable || visited.has(variable.id)) continue;
			visited.add(variable.id);
			for (const capture of module.capturesOf(helper))
				if (isLexicalBinding(capture)) captures.add(capture);
			collect(helper);
		}
	};
	collect(root);
	return [...captures];
}

function localHelper(module: BoundModule, call: NodeRef): NodeRef | undefined {
	if (call.node.kind !== 'CallExpression' || call.target?.isMember()) return undefined;
	const variable = call.target?.rootVariable;
	if (!variable || variable.importedFrom) return undefined;
	if (variable.declarationKind === 'FunctionDeclaration')
		return module
			.walk()
			.ofKind('FunctionDeclaration')
			.first((candidate) => bindingMatches(candidate.children().first(), variable));
	if (variable.declarationKind !== 'VariableDeclaration') return undefined;
	const declaration = module
		.walk()
		.ofKind('VariableDeclaration')
		.first((candidate) => bindingMatches(candidate.children().first(), variable));
	const initializer = declaration?.children().toArray().at(-1);
	return initializer &&
		(initializer.node.kind === 'ArrowFunction' || initializer.node.kind === 'FunctionExpression')
		? initializer
		: undefined;
}

function bindingMatches(binding: NodeRef | undefined, variable: Variable): boolean {
	return (
		binding
			?.walk()
			.references()
			.any((reference) => reference.variable === variable) ?? false
	);
}

function isIntrinsicCollectionCall(call: NodeRef): boolean {
	const receiver = call.target?.target;
	const directReactive = /^this\.(?:state|props)(?:\.|\[)/.test(receiver?.node.text?.trim() ?? '');
	// Isolated transforms continue through pre-existing type errors. A direct
	// compiler-owned state/props member may consequently be `any`; arbitrary
	// receivers never receive this fallback.
	if (directReactive && (isIntrinsicCollection(receiver?.type) || receiver?.type?.kind === 'any'))
		return true;
	if (isTypeScriptLibraryCall(call)) return true;
	return isIntrinsicCollection(receiver?.type);
}

function isTypeScriptLibraryCall(call: NodeRef): boolean {
	const declaration = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, '/');
	return (
		!!declaration &&
		/(?:\/typescript|\/@typescript\/[^/]+)\/lib\/lib\.[^/]+\.d\.ts$/i.test(declaration)
	);
}

function isTypeScriptLibraryVariable(variable: Variable | undefined): boolean {
	const id = variable?.id.replace(/\\/g, '/');
	return !!id && /(?:\/typescript|\/@typescript\/[^/]+)\/lib\/lib\.[^/]+\.d\.ts(?:::|$)/i.test(id);
}

function isIntrinsicCollection(type: NodeRef['type']): boolean {
	if (!type) return false;
	if (type.collectionKind) return true;
	return (
		/(?:\[\]|\bArray<|\bReadonlyArray<)/.test(type.display) ||
		['length', 'filter', 'map', 'slice', 'reduce'].every((property) =>
			type.properties.includes(property)
		) ||
		(type.unionMembers.length > 0 && type.unionMembers.every(isIntrinsicCollection))
	);
}

function isWithin(reference: NodeRef, ancestor: NodeRef): boolean {
	return (
		reference.node === ancestor.node ||
		reference.ancestors().any((candidate) => candidate.node === ancestor.node)
	);
}

function isLexicalBinding(variable: Variable): boolean {
	return [
		'VariableDeclaration',
		'Parameter',
		'BindingElement',
		'FunctionDeclaration',
		'ClassDeclaration',
		'ImportSpecifier',
		'ImportClause',
		'NamespaceImport',
		'ThisKeyword'
	].includes(variable.declarationKind);
}
