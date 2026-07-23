import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';

import type { ExactProvenanceGraph } from '../provenance.js';

import type { ExactContextEffect } from '../types.js';

import { expressionStatePath } from './writes.js';

import type { ExpressionComponentSite } from './contracts.js';

/** Performs the component site map domain operation. */
export function componentSiteMap(
	entries: readonly (readonly [string, ExpressionComponentSite])[]
): ReadonlyMap<string, ExpressionComponentSite> {
	const primary = new Map(entries);
	const names = new Map<string, ExpressionComponentSite | undefined>();
	for (const [, site] of entries) names.set(site.name, names.has(site.name) ? undefined : site);
	return Object.freeze({
		get size() {
			return primary.size;
		},
		get(key: string) {
			return primary.get(key) ?? names.get(key);
		},
		has(key: string) {
			return primary.has(key) || names.get(key) !== undefined;
		},
		entries: () => primary.entries(),
		keys: () => primary.keys(),
		values: () => primary.values(),
		forEach(
			callback: (
				value: ExpressionComponentSite,
				key: string,
				map: ReadonlyMap<string, ExpressionComponentSite>
			) => void,
			thisArg?: unknown
		) {
			primary.forEach((value, key) => callback.call(thisArg, value, key, this));
		},
		[Symbol.iterator]: () => primary[Symbol.iterator]()
	});
}

/** Performs the declaration description domain operation. */
export function declarationDescription(kind: string): string {
	if (['VariableDeclaration', 'BindingElement'].includes(kind)) return 'variable';
	if (['ClassDeclaration', 'ClassExpression'].includes(kind)) return 'class';
	return kind;
}
/** Performs the expression island captures domain operation. */
export function expressionIslandCaptures(
	module: BoundModule,
	component: NodeRef,
	island: NodeRef | undefined
): Readonly<{ values: string[]; functions: string[] }> {
	if (!island) return { values: [], functions: [] };
	const values = new Set<string>();
	const functions = new Set<string>();
	const visited = new Set<string>();
	const addCapture = (variable: Variable): void => {
		if (visited.has(variable.id)) return;
		visited.add(variable.id);
		if (
			!['VariableDeclaration', 'BindingElement', 'FunctionDeclaration'].includes(
				variable.declarationKind
			)
		)
			return;
		const declaration = variableDeclaration(module, variable);
		if (!declaration || isWithin(declaration, island)) return;
		if (declarationOwner(declaration)?.node !== component.node) return;
		if (isCloneableFunctionDeclaration(declaration)) {
			functions.add(variable.name);
			for (const dependency of module.dependenciesOf(declaration)) addCapture(dependency);
		} else values.add(variable.name);
	};
	for (const variable of module.dependenciesOf(island)) addCapture(variable);
	return { values: [...values].sort(), functions: [...functions].sort() };
}

/** Performs the expression island state reads domain operation. */
export function expressionIslandStateReads(
	module: BoundModule,
	island: NodeRef | undefined,
	provenance: ExactProvenanceGraph | undefined,
	aliases: ReadonlyMap<string, readonly string[]>
): string[] {
	if (!island) return [];
	const paths = new Set<string>();
	const visitedVariables = new Set<string>();
	const collect = (root: NodeRef): void => {
		for (const reference of root.walk().references()) {
			const alias = reference.variable ? aliases.get(reference.variable.id) : undefined;
			if (!alias?.length) continue;
			if (reference.parent?.isMember() && reference.parent.target?.node === reference.node)
				continue;
			paths.add(alias.join('.'));
		}
		for (const member of root.walk().memberAccesses()) {
			if (member.parent?.isMember() && member.parent.target?.node === member.node) continue;
			const path = expressionStatePath(module, member.node, aliases);
			if (path?.length) paths.add(path.join('.'));
		}
		if (!provenance) return;
		for (const variable of module.dependenciesOf(root)) {
			const entry = provenance.get(variable);
			if (
				visitedVariables.has(variable.id) ||
				entry?.provenance !== 'derived' ||
				!entry.safeToReevaluate
			)
				continue;
			if (aliases.has(variable.id)) continue;
			visitedVariables.add(variable.id);
			const declaration = variableDeclaration(module, variable);
			const initializer = declaration?.children().toArray().at(-1);
			if (initializer && initializer.node !== declaration?.children().first()?.node)
				collect(initializer);
		}
	};
	collect(island);
	return [...paths].sort();
}

function variableDeclaration(module: BoundModule, variable: Variable): NodeRef | undefined {
	return module
		.walk()
		.references()
		.where((reference) => reference.variable === variable)
		.toArray()
		.sort(
			(left, right) =>
				(left.node.span?.start ?? Number.MAX_SAFE_INTEGER) -
				(right.node.span?.start ?? Number.MAX_SAFE_INTEGER)
		)
		.map((reference) => {
			const declaration = reference
				.ancestors()
				.first((ancestor) => ancestor.node.kind === variable.declarationKind);
			if (!declaration) return undefined;
			const name = declaration.children().first();
			if (variable.declarationKind === 'BindingElement') {
				return reference.parent?.node === declaration.node ? declaration : undefined;
			}
			return name && isWithin(reference, name) ? declaration : undefined;
		})
		.find((declaration): declaration is NodeRef => !!declaration);
}

function declarationOwner(declaration: NodeRef): NodeRef | undefined {
	return declaration.ancestors().functions().first();
}

function isCloneableFunctionDeclaration(declaration: NodeRef): boolean {
	if (declaration.node.kind === 'FunctionDeclaration') return true;
	if (declaration.node.kind !== 'VariableDeclaration') return false;
	const initializer = declaration.children().toArray().at(-1)?.node.kind;
	return initializer === 'ArrowFunction' || initializer === 'FunctionExpression';
}

function isWithin(reference: NodeRef, owner: NodeRef): boolean {
	return (
		reference.node === owner.node ||
		reference.ancestors().any((ancestor) => ancestor.node === owner.node)
	);
}

/** Reports whether client island attribute. */
export function isClientIslandAttribute(name: string): boolean {
	return (
		name === 'ref' ||
		/^on[A-Z]/.test(name) ||
		name === 'value:input' ||
		name === 'value:change' ||
		name === 'checked:change'
	);
}
/** Performs the node path domain operation. */
export function nodePath(reference: NodeRef, component: NodeRef): string {
	const path: number[] = [];
	let current = reference;
	while (current.parent && current.parent.node !== component.node) {
		path.unshift(current.parent.node.children.indexOf(current.node));
		current = current.parent;
	}
	if (current.parent?.node === component.node)
		path.unshift(component.node.children.indexOf(current.node));
	return path.join('.');
}

/** Performs the unique contexts domain operation. */
export function uniqueContexts(values: readonly ExactContextEffect[]): ExactContextEffect[] {
	return [
		...new Map(
			values.map((value) => [`${value.kind}:${value.token}:${value.confidence}`, value])
		).values()
	].sort((left, right) =>
		`${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`)
	);
}

/** Performs the nearest component domain operation. */
export function nearestComponent(
	reference: NodeRef,
	components: ReadonlySet<NodeRef['node']>
): NodeRef | undefined {
	return reference
		.ancestors()
		.functions()
		.first((candidate) => components.has(candidate.node));
}

/** Performs the inside task domain operation. */
export function insideTask(reference: NodeRef): boolean {
	return reference
		.ancestors()
		.calls()
		.any((call) => /^this\.task(?:\.[A-Za-z_$][\w$]*)?\s*\(/.test(call.node.text ?? ''));
}

/** Performs the inside client island domain operation. */
export function insideClientIsland(reference: NodeRef): boolean {
	return reference
		.ancestors()
		.jsxElements()
		.any((element) =>
			element.node.attributes.some((attribute) => isClientIslandAttribute(attribute.name ?? ''))
		);
}

/** Performs the inside client island opening domain operation. */
export function insideClientIslandOpening(reference: NodeRef): boolean {
	if (!insideClientIsland(reference)) return false;
	return reference
		.ancestors()
		.any(
			(ancestor) =>
				ancestor.node.kind === 'JsxAttribute' ||
				ancestor.node.kind === 'JsxOpeningElement' ||
				ancestor.node.kind === 'JsxSelfClosingElement'
		);
}

/** Performs the span start domain operation. */
export function spanStart(reference: NodeRef): number {
	return reference.node.span?.start ?? 0;
}
