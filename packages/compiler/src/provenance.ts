import type { BoundModule, ExpressionNode, Variable } from '@exactjs/expressions';
import { expressionComponentIndex } from './expression/component-index.js';
import {
	hasWriteAfterDeclaration,
	isReactiveCollectionCallbackMethod,
	isSafeDerivedInitializer,
	localHelperCaptures
} from './expression/reevaluation-safety.js';

/** Defines the exact reactive provenance type contract. */
export type ExactReactiveProvenance =
	| 'state'
	| 'props'
	| 'context'
	| 'derived'
	| 'cell'
	| 'snapshot'
	| 'unknown';

/** Defines the exact provenance entry interface contract. */
export interface ExactProvenanceEntry {
	readonly variable: Variable;
	readonly provenance: ExactReactiveProvenance;
	readonly dependencies: readonly Variable[];
	readonly safeToReevaluate: boolean;
}

/** Defines the exact provenance graph interface contract. */
export interface ExactProvenanceGraph {
	readonly entries: readonly ExactProvenanceEntry[];
	readonly cells: readonly ExactReactiveCell[];
	readonly byVariableId: ReadonlyMap<string, ExactProvenanceEntry>;
	get(variable: Variable): ExactProvenanceEntry | undefined;
}

/** Defines the exact reactive cell interface contract. */
export interface ExactReactiveCell {
	readonly node: ExpressionNode;
	readonly kind: 'jsx-child' | 'jsx-attribute';
	readonly dependencies: readonly Variable[];
}

/** Adds eXact semantics over the package's generic canonical dependency model. */
export function buildExactProvenance(
	module: BoundModule,
	callEffects: ReadonlyMap<string, Readonly<{ reevaluationSafe: boolean }>> = new Map()
): ExactProvenanceGraph {
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
		const functionInitializer =
			initializer &&
			(initializer.node.kind === 'ArrowFunction' || initializer.node.kind === 'FunctionExpression');
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
			if (!functionInitializer) {
				for (const variable of initializer ? module.dependenciesOf(initializer) : [])
					if (variable !== declared) values.add(variable);
				for (const variable of initializer ? localHelperCaptures(module, initializer) : [])
					if (variable !== declared) values.add(variable);
			}
			dependencies.set(declared, values);
			reevaluationSafety.set(
				declared,
				!hasWriteAfterDeclaration(module, declared, binding) &&
					!!initializer &&
					isSafeDerivedInitializer(
						module,
						initializer,
						new Set(),
						(call) => callEffects.get(call.node.id)?.reevaluationSafe === true
					)
			);
		}
		if (functionInitializer) continue;
		const text = declaration.node.text ?? '';
		for (const declared of new Set(declaredVariables)) {
			if (/\bpeek\s*\(/.test(text)) hints.set(declared, 'snapshot');
			else if (/\bthis\.state\b/.test(text)) hints.set(declared, 'derived');
			else if (/\bthis\.props\b/.test(text)) hints.set(declared, 'derived');
			else if (/\b(?:useContext|this\.(?:getContext|context))\b/.test(text))
				hints.set(declared, 'context');
		}
	}

	for (const call of module.walk().calls()) {
		if (!call.target?.isMember() || !isReactiveCollectionCallbackMethod(call.target.name ?? ''))
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
				safeToReevaluate: safelyReevaluates(variable)
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

	function safelyReevaluates(variable: Variable, resolving = new Set<Variable>()): boolean {
		if (!(reevaluationSafety.get(variable) ?? true)) return false;
		if (resolving.has(variable)) return true;
		const next = new Set(resolving);
		next.add(variable);
		return [...(dependencies.get(variable) ?? [])].every(
			(dependency) => classify(dependency) !== 'derived' || safelyReevaluates(dependency, next)
		);
	}
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
