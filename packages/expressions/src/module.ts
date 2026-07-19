import { buildControlFlowGraph, type ControlFlowGraph } from './control-flow.js';
import type {
	EmitOptions,
	EmitResult,
	ExpressionDiagnostic,
	ExpressionNode,
	NodeEffect,
	Variable,
	WalkOptions
} from './model.js';
import { buildParentIndex, NodeQuery, NodeRef, type ParentIndex } from './query.js';
import { detectTrivia, sourceMap } from './module/source.js';

export type ModuleState = 'bound' | 'unbound';

export interface SourceTrivia {
	readonly newline: 'lf' | 'crlf';
	readonly quote: 'single' | 'double';
	readonly shebang?: string;
	readonly directives: readonly string[];
}

export interface ModuleData {
	readonly filename: string;
	readonly source: string;
	readonly root: ExpressionNode;
	readonly state: ModuleState;
	readonly diagnostics?: readonly ExpressionDiagnostic[] | (() => readonly ExpressionDiagnostic[]);
	readonly trivia?: SourceTrivia;
	readonly emitGenerated?: (options?: EmitOptions) => EmitResult;
	readonly provenance?: SourceProvenance;
}

export interface SourceProvenance {
	readonly originalSource: string;
	readonly lineOrigins: readonly number[];
}

let nextVersion = 1;
const analysisCache = new WeakMap<
	ExpressionModule,
	Readonly<{
		effects: readonly NodeEffect[];
		captures: ReadonlyMap<ExpressionNode, readonly Variable[]>;
	}>
>();
const defaultWalkCache = new WeakMap<ExpressionModule, readonly NodeRef[]>();
const subtreeEffectsCache = new WeakMap<ExpressionNode, Map<string, readonly NodeEffect[]>>();
const captureCache = new WeakMap<ExpressionNode, Map<string, readonly Variable[]>>();
const diagnosticCache = new WeakMap<ExpressionModule, readonly ExpressionDiagnostic[]>();
const diagnosticLoaders = new WeakMap<ExpressionModule, () => readonly ExpressionDiagnostic[]>();

/** Immutable, versioned expression module. */
export class ExpressionModule<S extends ModuleState = ModuleState> {
	readonly version = nextVersion++;
	readonly filename: string;
	readonly source: string;
	readonly rootNode: ExpressionNode;
	readonly state: S;
	readonly trivia: SourceTrivia;
	private readonly emitGenerated?: (options?: EmitOptions) => EmitResult;
	readonly provenance?: SourceProvenance;
	private readonly parents: ParentIndex;

	constructor(data: ModuleData & { state: S }) {
		this.filename = data.filename;
		this.source = data.source;
		this.rootNode = data.root;
		this.state = data.state;
		if (typeof data.diagnostics === 'function') diagnosticLoaders.set(this, data.diagnostics);
		else diagnosticCache.set(this, Object.freeze([...(data.diagnostics ?? [])]));
		this.trivia = data.trivia ?? detectTrivia(data.source);
		this.emitGenerated = data.emitGenerated;
		this.provenance = data.provenance;
		this.parents = buildParentIndex(data.root);
		Object.freeze(this);
	}

	get diagnostics(): readonly ExpressionDiagnostic[] {
		const cached = diagnosticCache.get(this);
		if (cached) return cached;
		const diagnostics = Object.freeze([...(diagnosticLoaders.get(this)?.() ?? [])]);
		diagnosticLoaders.delete(this);
		diagnosticCache.set(this, diagnostics);
		return diagnostics;
	}

	get root(): NodeRef {
		return new NodeRef(this.rootNode, this.parents);
	}

	walk(options?: WalkOptions): NodeQuery {
		if (options !== undefined) return this.root.walk(options);
		const module = this;
		return new NodeQuery(() => defaultWalk(module));
	}

	ref(node: ExpressionNode): NodeRef {
		if (!this.parents.has(node))
			throw new Error('Node does not belong to this expression module version');
		return new NodeRef(node, this.parents);
	}

	effects(): readonly NodeEffect[] {
		return getAnalyses(this).effects;
	}

	effectsOf(node: ExpressionNode | NodeRef): readonly NodeEffect[] {
		const target = node instanceof NodeRef ? node.node : node;
		if (!this.parents.has(target))
			throw new Error('Node does not belong to this expression module version');
		let cache = subtreeEffectsCache.get(target);
		if (!cache) subtreeEffectsCache.set(target, (cache = new Map()));
		const context = analysisContext(this, target);
		const cached = cache.get(context);
		if (cached) return cached;
		const effects = Object.freeze(
			getAnalyses(this).effects.filter((effect) => isWithin(effect.node, target))
		);
		cache.set(context, effects);
		return effects;
	}

	dependenciesOf(node: ExpressionNode | NodeRef): readonly Variable[] {
		return Object.freeze([
			...new Set(
				this.effectsOf(node)
					.filter((effect) => effect.kind === 'read')
					.map((effect) => effect.variable)
			)
		]);
	}

	writesOf(node: ExpressionNode | NodeRef): readonly Variable[] {
		return Object.freeze([
			...new Set(
				this.effectsOf(node)
					.filter((effect) => effect.kind === 'write')
					.map((effect) => effect.variable)
			)
		]);
	}

	capturesOf(functionNode: ExpressionNode | NodeRef): readonly Variable[] {
		const target = functionNode instanceof NodeRef ? functionNode.node : functionNode;
		let cache = captureCache.get(target);
		if (!cache) captureCache.set(target, (cache = new Map()));
		const context = analysisContext(this, target);
		const cached = cache.get(context);
		if (cached) return cached;
		const captures = getAnalyses(this).captures.get(target) ?? Object.freeze([]);
		cache.set(context, captures);
		return captures;
	}

	controlFlowOf(functionNode: ExpressionNode | NodeRef): ControlFlowGraph {
		const reference = functionNode instanceof NodeRef ? functionNode : this.ref(functionNode);
		return buildControlFlowGraph(reference);
	}

	validate(): readonly ExpressionDiagnostic[] {
		return this.diagnostics;
	}

	emit(options: EmitOptions = {}): EmitResult {
		if (options.format === 'generated' && this.emitGenerated) return this.emitGenerated(options);
		if (this.emitGenerated && !this.source) return this.emitGenerated(options);
		const newline =
			options.newline === 'crlf' ? '\r\n' : options.newline === 'lf' ? '\n' : undefined;
		const code = newline ? this.source.replace(/\r?\n/g, newline) : this.source;
		return {
			code,
			...(options.sourceMap
				? {
						map: sourceMap(
							this.filename,
							this.provenance?.originalSource ?? this.source,
							code,
							this.provenance?.lineOrigins
						)
					}
				: {})
		};
	}
}

/**
 * Analyses may be reused for a structurally shared subtree only while its
 * semantic position is equivalent.  Object identity alone is unsafe after a
 * move; module identity alone defeats structural-sharing reuse.
 */
function analysisContext(module: ExpressionModule, node: ExpressionNode): string {
	const parts: string[] = [];
	let child = module.ref(node);
	for (const parent of child.ancestors()) {
		parts.push(
			`${parent.node.kind}:${parent.node.operator ?? ''}:${parent.node.children.indexOf(child.node)}`
		);
		child = parent;
	}
	return parts.join('/');
}

function defaultWalk(module: ExpressionModule): readonly NodeRef[] {
	const cached = defaultWalkCache.get(module);
	if (cached) return cached;
	const references = Object.freeze(module.root.walk().toArray());
	defaultWalkCache.set(module, references);
	return references;
}

export type BoundModule = ExpressionModule<'bound'>;
export type UnboundModule = ExpressionModule<'unbound'>;

export function createModule<S extends ModuleState>(
	data: ModuleData & { state: S }
): ExpressionModule<S> {
	return new ExpressionModule(data);
}

function getAnalyses(module: ExpressionModule): Readonly<{
	effects: readonly NodeEffect[];
	captures: ReadonlyMap<ExpressionNode, readonly Variable[]>;
}> {
	const cached = analysisCache.get(module);
	if (cached) return cached;
	const effects: NodeEffect[] = [];
	const captures = new Map<ExpressionNode, Variable[]>();
	const functions: ExpressionNode[] = [];

	const visit = (ref: NodeRef, inType = false): void => {
		const node = ref.node;
		const typeMetadata = inType || node.category === 'type';
		const functionLike = isFunctionKind(node.kind);
		if (functionLike) functions.push(node);
		if (
			!typeMetadata &&
			node.variable &&
			(node.kind === 'Identifier' || node.kind === 'ThisKeyword')
		) {
			const kinds = referenceEffectKinds(ref);
			for (const kind of kinds)
				effects.push(Object.freeze({ node, variable: node.variable, kind }));
			const owner = functions[functions.length - 1];
			if (owner && !scopeContains(owner.scope, node.variable.scope)) {
				const values = captures.get(owner) ?? [];
				if (!values.includes(node.variable)) values.push(node.variable);
				captures.set(owner, values);
				effects.push(Object.freeze({ node, variable: node.variable, kind: 'capture' }));
			}
		}
		for (const child of ref.children()) visit(child, typeMetadata);
		if (functionLike) functions.pop();
	};
	visit(module.root);
	const frozenCaptures = new Map<ExpressionNode, readonly Variable[]>();
	for (const [node, values] of captures) frozenCaptures.set(node, Object.freeze([...values]));
	const result = Object.freeze({
		effects: Object.freeze(effects),
		captures: frozenCaptures as ReadonlyMap<ExpressionNode, readonly Variable[]>
	});
	analysisCache.set(module, result);
	return result;
}

function referenceEffectKinds(ref: NodeRef): readonly ('read' | 'write')[] {
	let child = ref.node;
	let assignedMemberName = false;
	for (const ancestor of ref.ancestors()) {
		const node = ancestor.node;
		if (
			(node.kind === 'PropertyAccessExpression' || node.kind === 'ElementAccessExpression') &&
			child === node.children.at(-1)
		)
			assignedMemberName = true;
		if (
			(node.kind === 'VariableDeclaration' ||
				node.kind === 'Parameter' ||
				node.kind === 'BindingElement') &&
			isWithin(child, node.children[0]!)
		) {
			return ['write'];
		}
		if (
			node.kind === 'BinaryExpression' &&
			isWithin(child, node.children[0]!) &&
			assignmentOperators.has(node.operator ?? '')
		) {
			// The storage reference of `obj.x = value` reads `obj`; only a direct
			// identifier assignment writes that identifier binding.
			if (ref.node !== node.children[0] && !assignedMemberName) return ['read'];
			return node.operator === '=' ? ['write'] : ['read', 'write'];
		}
		if (
			(node.kind === 'PrefixUnaryExpression' || node.kind === 'PostfixUnaryExpression') &&
			/\+\+|--/.test(node.operator ?? '')
		) {
			return ['read', 'write'];
		}
		if (node.kind === 'DeleteExpression') return ['write'];
		if (isFunctionKind(node.kind) || node.kind.endsWith('Statement')) break;
		child = node;
	}
	return ['read'];
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

function isWithin(node: ExpressionNode, ancestor: ExpressionNode): boolean {
	if (node === ancestor) return true;
	if (node.span && ancestor.span)
		return node.span.start >= ancestor.span.start && node.span.end <= ancestor.span.end;
	return ancestor.children.some((child) => isWithin(node, child));
}

function isFunctionKind(kind: string): boolean {
	return (
		kind === 'FunctionDeclaration' ||
		kind === 'FunctionExpression' ||
		kind === 'ArrowFunction' ||
		kind === 'MethodDeclaration'
	);
}

function scopeContains(
	functionScope: ExpressionNode['scope'],
	variableScope: ExpressionNode['scope']
): boolean {
	let cursor: ExpressionNode['scope'] | undefined = variableScope;
	while (cursor) {
		if (cursor === functionScope || cursor.id === functionScope.id) return true;
		cursor = cursor.parent;
	}
	return false;
}
