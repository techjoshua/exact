import {
	lowerModuleText,
	rewriteModule,
	type BoundModule,
	type NodeRef,
	type UnboundModule,
	type Variable
} from '@exactjs/expressions';
import { expressionComponentIndex } from './component-index.js';

/** Describes the result produced by expression write. */
export interface ExpressionWriteResult {
	readonly module: BoundModule | UnboundModule;
	readonly changed: boolean;
	readonly count: number;
}

/** Defines the expression write site interface contract. */
export interface ExpressionWriteSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly path: readonly string[];
	/** Absolute state path already represented by the source alias at this write site. */
	readonly aliasPath?: readonly string[];
	readonly operation: 'assignment' | 'update' | 'delete' | 'array-mutation';
}

/** Describes the planned expression write operation. */
export interface ExpressionWritePlan {
	readonly sites: ReadonlyMap<string, ExpressionWriteSite>;
	readonly aliases: ReadonlyMap<string, readonly string[]>;
}
interface StateAliases {
	readonly paths: ReadonlyMap<string, readonly string[]>;
	readonly invalidAt: ReadonlyMap<string, number>;
}

const assignmentOperators = new Set([
	'=',
	'+=',
	'-=',
	'*=',
	'/=',
	'%=',
	'**=',
	'<<=',
	'>>=',
	'>>>=',
	'&=',
	'|=',
	'^=',
	'&&=',
	'||=',
	'??='
]);
const arrayMutators = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift'
]);

/** Lowers direct component-state writes using immutable expression rewrites. */
export function lowerExpressionWrites(module: BoundModule): ExpressionWriteResult {
	const used = new Set(
		module
			.walk()
			.references()
			.toArray()
			.map((reference) => reference.name)
			.filter((name): name is string => !!name)
	);
	const names = {
		write: allocate('__exactWrite', used),
		update: allocate('__exactUpdate', used),
		updateResult: allocate('__exactUpdateResult', used),
		remove: allocate('__exactDelete', used),
		array: allocate('__exactArrayMutation', used)
	};
	const imports = new Map<string, string>();
	const aliasInfo = collectStateAliases(module);
	const aliases = aliasInfo.paths;

	let count = 0;
	let generated = lowerModuleText(module, (context) => {
		if (!insideComponent(module, context.reference)) return undefined;
		const replacement = lowerWrite(
			module,
			context.reference,
			aliases,
			names,
			imports,
			aliasInfo.invalidAt,
			context.childText
		);
		if (replacement !== undefined) count++;
		return replacement;
	});
	if (!count) return Object.freeze({ module, changed: false, count: 0 });

	const importText = `import { ${[...imports].map(([imported, local]) => `${imported} as ${local}`).join(', ')} } from "@exactjs/reactive";`;
	generated = insertAfterDirectives(generated, importText);
	const rewritten = rewriteModule(module, (rewriter) => {
		rewriter.replaceTextWhere(
			(reference) => reference.node === module.rootNode,
			() => generated
		);
	});
	return Object.freeze({ module: rewritten, changed: true, count });
}

/** Identifies compiler-owned state writes without changing source coordinates. */
export function analyzeExpressionWrites(module: BoundModule): ExpressionWritePlan {
	const aliasInfo = collectStateAliases(module);
	const aliases = aliasInfo.paths;
	const sites = new Map<string, ExpressionWriteSite>();
	for (const reference of module.walk()) {
		if (!insideComponent(module, reference) || !reference.node.span) continue;
		const path = writePath(module, reference, aliases, aliasInfo.invalidAt);
		if (!path?.length) continue;
		const target = writeTarget(reference);
		const site = Object.freeze({
			nodeId: reference.node.id,
			start: reference.node.span.start,
			end: reference.node.span.end,
			path: Object.freeze(path),
			aliasPath: target ? stateAliasPath(module, target, aliases) : undefined,
			operation: writeOperation(reference)
		});
		sites.set(site.nodeId, site);
	}
	return Object.freeze({ sites, aliases });
}

function writeTarget(reference: NodeRef): NodeRef['node'] | undefined {
	const node = reference.node;
	if (
		node.kind === 'BinaryExpression' ||
		node.kind === 'PrefixUnaryExpression' ||
		node.kind === 'PostfixUnaryExpression' ||
		node.kind === 'DeleteExpression'
	)
		return node.children[0];
	if (node.kind === 'CallExpression' && reference.target?.isMember())
		return reference.target.target?.node;
	return undefined;
}

function stateAliasPath(
	module: BoundModule,
	node: NodeRef['node'],
	aliases: ReadonlyMap<string, readonly string[]>
): readonly string[] | undefined {
	let reference = module.ref(node);
	while (reference.isMember() && reference.target) reference = reference.target;
	if (reference.node.kind !== 'Identifier') return undefined;
	const variable = reference.variable ?? reference.walk().references().first()?.variable;
	return variable ? aliases.get(variable.id) : undefined;
}

function writeOperation(reference: NodeRef): ExpressionWriteSite['operation'] {
	if (reference.node.kind === 'CallExpression') return 'array-mutation';
	if (reference.node.kind === 'DeleteExpression') return 'delete';
	if (
		reference.node.kind === 'PrefixUnaryExpression' ||
		reference.node.kind === 'PostfixUnaryExpression' ||
		reference.node.operator !== '='
	)
		return 'update';
	return 'assignment';
}

function writePath(
	module: BoundModule,
	reference: NodeRef,
	aliases: ReadonlyMap<string, readonly string[]>,
	invalidAt?: ReadonlyMap<string, number>
): string[] | undefined {
	const node = reference.node;
	if (node.kind === 'BinaryExpression' && assignmentOperators.has(node.operator ?? '')) {
		return statePath(module, node.children[0], aliases, invalidAt);
	}
	if (
		(node.kind === 'PrefixUnaryExpression' || node.kind === 'PostfixUnaryExpression') &&
		(node.operator === '++' || node.operator === '--')
	) {
		return statePath(module, node.children[0], aliases, invalidAt);
	}
	if (node.kind === 'DeleteExpression')
		return statePath(module, node.children[0], aliases, invalidAt);
	if (
		node.kind === 'CallExpression' &&
		reference.target?.isMember() &&
		arrayMutators.has(reference.target.name ?? '')
	) {
		return statePath(module, reference.target.target?.node, aliases, invalidAt);
	}
	return undefined;
}

function lowerWrite(
	module: BoundModule,
	reference: NodeRef,
	aliases: ReadonlyMap<string, readonly string[]>,
	names: Readonly<{
		write: string;
		update: string;
		updateResult: string;
		remove: string;
		array: string;
	}>,
	imports: Map<string, string>,
	invalidAt?: ReadonlyMap<string, number>,
	childText?: readonly string[]
): string | undefined {
	const node = reference.node;
	if (node.kind === 'BinaryExpression' && assignmentOperators.has(node.operator ?? '')) {
		const left = node.children[0];
		const right = node.children.at(-1);
		const path = statePath(module, left, aliases, invalidAt);
		const rightText = childText?.at(-1) ?? right?.text;
		if (!path?.length || !rightText) return undefined;
		if (node.operator === '=') {
			imports.set('writeReactiveLazy', names.write);
			return `${names.write}(this.state, ${JSON.stringify(path)}, () => (${rightText}))`;
		}
		imports.set('updateReactiveValue', names.update);
		return `${names.update}(this.state, ${JSON.stringify(path)}, previous => previous ${node.operator!.slice(0, -1)} (${rightText}))`;
	}
	if (
		(node.kind === 'PrefixUnaryExpression' || node.kind === 'PostfixUnaryExpression') &&
		(node.operator === '++' || node.operator === '--')
	) {
		const path = statePath(module, node.children[0], aliases, invalidAt);
		if (!path?.length) return undefined;
		imports.set('updateReactiveValueWithResult', names.updateResult);
		const update = node.operator === '++' ? '++' : '--';
		const expression =
			node.kind === 'PostfixUnaryExpression' ? `previous${update}` : `${update}previous`;
		return `${names.updateResult}(this.state, ${JSON.stringify(path)}, previous => { const result = ${expression}; return [previous, result]; })`;
	}
	if (node.kind === 'DeleteExpression') {
		const path = statePath(module, node.children[0], aliases, invalidAt);
		if (!path?.length) return undefined;
		imports.set('deleteReactiveValue', names.remove);
		return `${names.remove}(this.state, ${JSON.stringify(path)})`;
	}
	if (
		node.kind === 'CallExpression' &&
		reference.target?.isMember() &&
		arrayMutators.has(reference.target.name ?? '')
	) {
		const path = statePath(module, reference.target.target?.node, aliases, invalidAt);
		if (!path?.length) return undefined;
		imports.set('mutateReactiveArray', names.array);
		const argumentsText = reference.arguments.map((argument) => {
			const index = node.children.indexOf(argument.node);
			return index >= 0 ? (childText?.[index] ?? argument.node.text) : argument.node.text;
		});
		return `${names.array}(this.state, ${JSON.stringify(path)}, ${JSON.stringify(reference.target.name)}, () => [${argumentsText.join(', ')}])`;
	}
	return undefined;
}

/** Resolves a statically addressable state path through canonical aliases. */
export function expressionStatePath(
	module: BoundModule,
	node: NodeRef['node'] | undefined,
	aliases: ReadonlyMap<string, readonly string[]>,
	invalidAt?: ReadonlyMap<string, number>
): string[] | undefined {
	if (!node) return undefined;
	const reference = module.ref(node);
	if (reference.isMember()) {
		if (/^this\.state$/.test(node.text?.trim() ?? '')) {
			const owner = expressionComponentIndex(module).owner(reference);
			const parameters = owner
				? (owner.node as { parameters?: readonly Variable[] }).parameters
				: undefined;
			const componentThis = parameters?.find((parameter) => parameter.name === 'this');
			return componentThis && reference.rootVariable === componentThis ? [] : undefined;
		}
		const base = expressionStatePath(module, reference.target?.node, aliases, invalidAt);
		const segment = staticMemberSegment(reference);
		return base && segment !== undefined ? [...base, segment] : undefined;
	}
	if (node.kind !== 'Identifier') return undefined;
	const variable = reference.variable ?? reference.walk().references().first()?.variable;
	if (
		variable &&
		invalidAt?.has(variable.id) &&
		(node.span?.start ?? Number.MAX_SAFE_INTEGER) >= invalidAt.get(variable.id)!
	)
		return undefined;
	const base = variable ? aliases.get(variable.id) : undefined;
	return base ? [...base] : undefined;
}

function staticMemberSegment(reference: NodeRef): string | undefined {
	if (reference.node.kind === 'PropertyAccessExpression')
		return reference.name ?? reference.node.children[1]?.text;
	if (reference.name !== undefined) return reference.name;
	const argument = reference.node.children[1]?.text?.trim();
	if (!argument) return undefined;
	if (/^["'][\s\S]*["']$/.test(argument)) return argument.slice(1, -1);
	if (/^(?:0|[1-9]\d*)$/.test(argument)) return argument;
	return undefined;
}

const statePath = expressionStatePath;

function collectStateAliases(module: BoundModule): StateAliases {
	const aliases = new Map<string, readonly string[]>();
	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const children = declaration.children().toArray();
		const initializer = children.at(-1);
		const base = initializer ? statePath(module, initializer.node, aliases) : undefined;
		if (!base) continue;
		const name = children[0];
		if (name?.node.kind === 'Identifier' && name.variable) {
			aliases.set(name.variable.id, base);
			continue;
		}
		for (const binding of name?.walk().ofKind('BindingElement') ?? []) {
			const identifiers = binding
				.children()
				.where((child) => child.node.kind === 'Identifier')
				.toArray();
			const variable = identifiers.at(-1)?.variable;
			if (!variable) continue;
			const segment = identifiers.length > 1 ? identifiers[0]!.name : identifiers.at(-1)!.name;
			if (segment) aliases.set(variable.id, [...base, segment]);
		}
	}
	const invalidAt = new Map<string, number>();
	for (const assignment of module
		.walk()
		.assignments()
		.where(
			(reference) => reference.node.kind === 'BinaryExpression' && reference.node.operator === '='
		)) {
		const left = assignment.children().first();
		if (left?.node.kind !== 'Identifier') continue;
		const root = left?.walk().references().first()?.variable;
		if (!root?.mutable || !aliases.has(root.id) || !assignment.node.span) continue;
		invalidAt.set(
			root.id,
			Math.min(invalidAt.get(root.id) ?? Number.MAX_SAFE_INTEGER, assignment.node.span.start)
		);
	}
	return Object.freeze({ paths: aliases, invalidAt });
}

function insideComponent(module: BoundModule, reference: NodeRef): boolean {
	return expressionComponentIndex(module).owner(reference) !== undefined;
}

function insertAfterDirectives(source: string, importText: string): string {
	const directive = /^(?:\s*["'][^"'\r\n]+["'];?\s*(?:\r?\n|$))*/.exec(source)?.[0] ?? '';
	return `${directive}${importText}${directive.endsWith('\n') || !directive ? '\n' : '\n'}${source.slice(directive.length)}`;
}

function allocate(base: string, used: Set<string>): string {
	let name = base;
	let index = 1;
	while (used.has(name)) name = `${base}_${index++}`;
	used.add(name);
	return name;
}
