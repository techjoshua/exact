import type { BoundModule, ExpressionNode, NodeRef, Variable } from '@exact/expressions';
import { expressionComponentIndex } from './expression/component-index.js';
import { trackedCallbackArguments } from './annotations.js';

export type ExactReactiveProvenance =
	| 'state'
	| 'props'
	| 'context'
	| 'derived'
	| 'cell'
	| 'snapshot'
	| 'unknown';

export interface ExactProvenanceEntry {
	readonly variable: Variable;
	readonly provenance: ExactReactiveProvenance;
	readonly dependencies: readonly Variable[];
	readonly safeToReevaluate: boolean;
}

export interface ExactProvenanceGraph {
	readonly entries: readonly ExactProvenanceEntry[];
	readonly cells: readonly ExactReactiveCell[];
	readonly byVariableId: ReadonlyMap<string, ExactProvenanceEntry>;
	get(variable: Variable): ExactProvenanceEntry | undefined;
}

export interface ExactReactiveCell {
	readonly node: ExpressionNode;
	readonly kind: 'jsx-child' | 'jsx-attribute';
	readonly dependencies: readonly Variable[];
}

/** Adds eXact semantics over the package's generic canonical dependency model. */
export function buildExactProvenance(module: BoundModule): ExactProvenanceGraph {
	const dependencies = new Map<Variable, Set<Variable>>();
	const hints = new Map<Variable, ExactReactiveProvenance>();
	const reevaluationSafety = new Map<Variable, boolean>();

	for (const fn of expressionComponentIndex(module).functions) {
		for (const parameter of fn.node.parameters)
			hints.set(parameter, parameter.name === 'this' ? 'state' : 'props');
	}

	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const binding = declaration.children().first();
		const initializer = declaration.children().toArray().at(-1);
		const declaredVariables =
			binding
				?.walk()
				.references()
				.toArray()
				.map((reference) => reference.variable)
				.filter(
					(variable): variable is Variable =>
						!!variable &&
						['VariableDeclaration', 'BindingElement'].includes(variable.declarationKind)
				) ?? [];
		if (!declaredVariables.length) continue;
		for (const declared of new Set(declaredVariables)) {
			const values = dependencies.get(declared) ?? new Set<Variable>();
			for (const variable of initializer ? module.dependenciesOf(initializer) : [])
				if (variable !== declared) values.add(variable);
			dependencies.set(declared, values);
			reevaluationSafety.set(
				declared,
				!declared.mutable && !!initializer && isSafeDerivedInitializer(module, initializer)
			);
		}
		const text = declaration.node.text ?? '';
		for (const declared of new Set(declaredVariables)) {
			if (/\bpeek\s*\(/.test(text)) hints.set(declared, 'snapshot');
			else if (/\bthis\.state\b/.test(text)) hints.set(declared, 'derived');
			else if (/\bthis\.props\b/.test(text)) hints.set(declared, 'derived');
			else if (/\b(?:useContext|this\.(?:getContext|context))\b/.test(text))
				hints.set(declared, 'derived');
		}
	}

	for (const call of module.walk().calls()) {
		if (
			!call.target?.isMember() ||
			!['filter', 'map', 'flatMap', 'reduce', 'find', 'some', 'every'].includes(
				call.target.name ?? ''
			)
		)
			continue;
		const componentMap =
			call.target.name === 'map' && /^this\.map$/.test(call.target.node.text ?? '');
		const source = componentMap ? call.arguments[0] : call.target.target;
		const sources =
			source
				?.walk()
				.references()
				.toArray()
				.map((reference) => reference.variable)
				.filter((value): value is Variable => !!value) ?? [];
		const directlyReactive = /\bthis\.(?:state|props|context)\b/.test(source?.node.text ?? '');
		for (const argument of componentMap ? call.arguments.slice(1) : call.arguments) {
			if (!argument.node.kind.includes('Function') && argument.node.kind !== 'ArrowFunction')
				continue;
			const parameters =
				'parameters' in argument.node ? (argument.node.parameters as readonly Variable[]) : [];
			for (const parameter of parameters) {
				const values = dependencies.get(parameter) ?? new Set<Variable>();
				for (const sourceVariable of sources) values.add(sourceVariable);
				dependencies.set(parameter, values);
				if (directlyReactive) hints.set(parameter, 'derived');
			}
		}
	}

	const allVariables = new Map<string, Variable>();
	for (const reference of module.walk().references()) {
		if (reference.variable && isLexicalBinding(reference.variable))
			allVariables.set(reference.variable.id, reference.variable);
	}
	const resolving = new Set<Variable>();
	const resolved = new Map<Variable, ExactReactiveProvenance>();
	const classify = (variable: Variable): ExactReactiveProvenance => {
		const prior = resolved.get(variable);
		if (prior) return prior;
		const direct = hints.get(variable) ?? classifyName(variable.name);
		if (direct !== 'unknown') {
			resolved.set(variable, direct);
			return direct;
		}
		if (resolving.has(variable)) return 'unknown';
		resolving.add(variable);
		const reactive = [...(dependencies.get(variable) ?? [])].some((source) =>
			isReactive(classify(source))
		);
		resolving.delete(variable);
		const value = reactive ? 'derived' : 'unknown';
		resolved.set(variable, value);
		return value;
	};

	const entries = Object.freeze(
		[...allVariables.values()].map((variable) =>
			Object.freeze({
				variable,
				provenance: classify(variable),
				dependencies: Object.freeze([...(dependencies.get(variable) ?? [])]),
				safeToReevaluate: reevaluationSafety.get(variable) ?? true
			})
		)
	);
	const byVariableId = new Map(entries.map((entry) => [entry.variable.id, entry]));
	const cells: ExactReactiveCell[] = [];
	for (const jsx of module.walk().ofKind('JsxExpression')) {
		const cellDependencies = module
			.dependenciesOf(jsx)
			.filter((variable) => isReactive(classify(variable)));
		if (!cellDependencies.length) continue;
		cells.push(
			Object.freeze({
				node: jsx.node,
				kind: jsx.parent?.node.kind === 'JsxAttribute' ? 'jsx-attribute' : 'jsx-child',
				dependencies: Object.freeze([...new Set(cellDependencies)])
			})
		);
	}
	return Object.freeze({
		entries,
		cells: Object.freeze(cells),
		byVariableId,
		get: (variable: Variable) => byVariableId.get(variable.id)
	});
}

const safeCollectionMethods = new Set([
	'filter',
	'map',
	'flatMap',
	'slice',
	'concat',
	'toSorted',
	'toReversed',
	'toSpliced',
	'reduce',
	'find',
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
	'substr'
]);

function isSafeDerivedInitializer(module: BoundModule, initializer: NodeRef): boolean {
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
		if (
			kind === 'NewExpression' ||
			kind === 'AwaitExpression' ||
			kind === 'YieldExpression' ||
			kind === 'DeleteExpression'
		)
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
		if (kind === 'CallExpression') {
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
				!reference.target?.isMember() ||
				!safeCollectionMethods.has(reference.target.name ?? '') ||
				!isIntrinsicCollectionCall(reference)
			)
				return false;
		}
	}
	return true;
}

function isIntrinsicCollectionCall(call: NodeRef): boolean {
	const receiver = call.target?.target;
	const directReactive = /^this\.(?:state|props)(?:\.|\[)/.test(receiver?.node.text?.trim() ?? '');
	// Editor/isolated transforms deliberately continue through pre-existing type
	// errors.  When the application omitted the Component import, TypeScript can
	// only report a direct state/props member as `any`; its syntactic provenance
	// is nevertheless compiler-owned.  Do not extend this fallback to arbitrary
	// receivers: custom objects named `filter`/`map` remain effectful by default.
	if (directReactive && (isIntrinsicCollection(receiver?.type) || receiver?.type?.kind === 'any'))
		return true;
	if (isTypeScriptLibraryCall(call)) return true;
	return isIntrinsicCollection(receiver?.type);
}

function isTypeScriptLibraryCall(call: NodeRef): boolean {
	const declaration = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, '/');
	return !!declaration && /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/i.test(declaration);
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

function isDeclarationName(reference: NodeRef, declaration: NodeRef): boolean {
	return (
		reference.parent?.node === declaration.node ||
		reference.ancestors().first()?.node === declaration.node
	);
}

function classifyName(name: string): ExactReactiveProvenance {
	if (name === 'state') return 'state';
	if (name === 'props') return 'props';
	if (name === 'context') return 'context';
	return 'unknown';
}

function isReactive(value: ExactReactiveProvenance): boolean {
	return (
		value === 'state' ||
		value === 'props' ||
		value === 'context' ||
		value === 'derived' ||
		value === 'cell'
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
