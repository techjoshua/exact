import type { BoundModule, NodeRef, Variable } from '@exact/expressions';
import { stableId } from '../ids.js';
import type { ExactProvenanceGraph } from '../provenance.js';
import { exactDirective, exactKeyContract, type ExactKeyContract } from '../annotations.js';

export interface ExpressionJsxElementSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly tagName?: string;
	readonly intrinsic: boolean;
	readonly exactId?: string;
	readonly attributes: readonly string[];
	readonly serverSlotChildren: boolean;
}

export interface ExpressionJsxCellSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly kind: 'jsx-child' | 'jsx-attribute';
	readonly dependencies: readonly Variable[];
	readonly reactive: boolean;
}

export interface ExpressionJsxPlan {
	readonly elements: ReadonlyMap<string, ExpressionJsxElementSite>;
	readonly cells: ReadonlyMap<string, ExpressionJsxCellSite>;
	/** Contextual parameter types that JSX lowering would otherwise erase. */
	readonly contextualParameters: ReadonlyMap<string, string>;
	readonly lists: ReadonlyMap<string, ExpressionJsxListSite>;
	readonly diagnostics: readonly Readonly<{ message: string; start: number }>[];
}

export interface ExpressionJsxListSite extends ExactKeyContract {
	readonly nodeId: string;
	readonly start: number;
}

/** Indexes JSX identities and reactive cells from typed expression relationships. */
export function analyzeExpressionJsx(
	module: BoundModule,
	provenance: ExactProvenanceGraph,
	identityFilename = module.filename
): ExpressionJsxPlan {
	const elements = new Map<string, ExpressionJsxElementSite>();
	for (const element of module.walk().jsxElements()) {
		if (!element.node.span) continue;
		const tagName = element.node.tagName;
		const intrinsic = !!tagName && (/^[a-z]/.test(tagName) || tagName.includes(':'));
		const site = Object.freeze({
			nodeId: element.node.id,
			start: element.node.span.start,
			end: element.node.span.end,
			...(tagName ? { tagName } : {}),
			intrinsic,
			...(intrinsic ? { exactId: stableId(identityFilename, 'element', element.node.id) } : {}),
			attributes: Object.freeze(
				element.node.attributes
					.map((attribute) => attribute.name)
					.filter((name): name is string => !!name)
			),
			serverSlotChildren: element.node.jsxChildren.some((child) => {
				if (child.kind === 'JsxText') return false;
				if (child.kind === 'JsxExpression')
					return module.ref(child).descendants().jsxElements().any();
				return (
					child.kind === 'JsxElement' ||
					child.kind === 'JsxSelfClosingElement' ||
					child.kind === 'JsxFragment'
				);
			})
		});
		elements.set(site.nodeId, site);
	}
	const reactiveCells = new Map(provenance.cells.map((cell) => [cell.node.id, cell]));
	const cells = new Map<string, ExpressionJsxCellSite>();
	for (const expression of module.walk().ofKind('JsxExpression')) {
		if (!expression.node.span) continue;
		const key = expression.node.id;
		const reactive = reactiveCells.get(key);
		const site = Object.freeze({
			nodeId: expression.node.id,
			start: expression.node.span.start,
			end: expression.node.span.end,
			kind:
				expression.parent?.node.kind === 'JsxAttribute'
					? ('jsx-attribute' as const)
					: ('jsx-child' as const),
			dependencies: reactive?.dependencies ?? module.dependenciesOf(expression),
			reactive: reactive !== undefined
		});
		cells.set(site.nodeId, site);
	}
	const contextualParameters = new Map<string, string>();
	for (const attribute of module.walk().jsxAttributes()) {
		for (const fn of attribute
			.descendants()
			.functions()
			.where((candidate) => !hasFunctionAncestorWithin(candidate, attribute))) {
			const declarations = fn
				.children()
				.where((child) => child.node.kind === 'Parameter')
				.toArray();
			declarations.forEach((parameter, index) => {
				if (
					!parameter.node.span ||
					parameter.children().any((child) => child.node.category === 'type')
				)
					return;
				const type = fn.node.parameters[index]?.type;
				if (!type || type.kind === 'any' || type.kind === 'unknown') return;
				contextualParameters.set(parameter.node.id, type.display);
			});
		}
	}
	const lists = new Map<string, ExpressionJsxListSite>();
	const diagnostics: Array<Readonly<{ message: string; start: number }>> = [];
	for (const call of module.walk().calls()) {
		if (
			!call.node.span ||
			!call.target?.isMember('map') ||
			/^this\.map$/.test(call.target.node.text ?? '')
		)
			continue;
		if (!call.ancestors().ofKind('JsxExpression').any() || !isIntrinsicArrayMap(call)) continue;
		const collection = call.target.target;
		const element = collectionElementType(collection?.type);
		const localDirectives = collection?.rootVariable?.directives;
		const key = exactKeyContract(element, localDirectives);
		const declaredKey = !!exactDirective(localDirectives, 'key') || typeDeclaresKey(element);
		if (!key) {
			if (declaredKey)
				diagnostics.push({
					message:
						'error: @exact key must identify one readable primitive property or zero-argument method',
					start: call.node.span.start
				});
			continue;
		}
		const render = call.arguments[0];
		const parameters =
			render && 'parameters' in render.node ? (render.node.parameters as readonly Variable[]) : [];
		if (
			!render ||
			!['ArrowFunction', 'FunctionExpression'].includes(render.node.kind) ||
			call.arguments.length !== 1 ||
			parameters.length > 1
		) {
			// Native index/array/thisArg behavior cannot be represented by the keyed
			// renderer. Preserve the author's Array.map call instead of changing its
			// semantics or turning an otherwise valid expression into a warning.
			continue;
		}
		lists.set(
			call.node.id,
			Object.freeze({ nodeId: call.node.id, start: call.node.span.start, ...key })
		);
	}
	return Object.freeze({
		elements,
		cells,
		contextualParameters,
		lists,
		diagnostics: Object.freeze(diagnostics)
	});
}

function collectionElementType(type: NodeRef['type']): NodeRef['type'] {
	if (!type) return undefined;
	if (type.typeArguments[0]) return type.typeArguments[0];
	if (type.unionMembers.length) {
		const members = type.unionMembers
			.map(collectionElementType)
			.filter((member): member is NonNullable<NodeRef['type']> => !!member);
		return members.length === 1 ? members[0] : undefined;
	}
	return undefined;
}

function typeDeclaresKey(type: NodeRef['type']): boolean {
	if (!type) return false;
	return (
		!!exactDirective(type.directives, 'key') ||
		type.propertyTypes.some((property) => !!exactDirective(property.directives, 'key')) ||
		type.unionMembers.some(typeDeclaresKey)
	);
}

function isIntrinsicArrayMap(call: NodeRef): boolean {
	const receiver = call.target?.target?.type;
	if (receiver?.collectionKind) return true;
	const source = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, '/');
	return !!source && /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/i.test(source);
}

function hasFunctionAncestorWithin(reference: NodeRef, owner: NodeRef): boolean {
	for (const ancestor of reference.ancestors()) {
		if (ancestor.node === owner.node) return false;
		if (ancestor.node.category === 'module') return false;
		if (
			['FunctionDeclaration', 'FunctionExpression', 'ArrowFunction', 'MethodDeclaration'].includes(
				ancestor.node.kind
			)
		)
			return true;
	}
	return false;
}
