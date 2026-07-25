import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { exactDirective, exactKeyContract, type ExactKeyContract } from '../annotations.js';
import { stableId } from '../ids.js';
import type { ExactProvenanceGraph } from '../provenance.js';
import { analyzeFormBindings, type ExpressionJsxBinding } from './form-bindings.js';
export type { ExpressionJsxBinding } from './form-bindings.js';

/** Defines the expression jsx element site interface contract. */
export interface ExpressionJsxElementSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly tagName?: string;
	readonly intrinsic: boolean;
	readonly exactId?: string;
	readonly attributes: readonly string[];
	readonly serverSlotChildren: boolean;
	readonly reactiveTag: boolean;
}

/** Defines the expression jsx cell site interface contract. */
export interface ExpressionJsxCellSite {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly kind: 'jsx-child' | 'jsx-attribute';
	readonly dependencies: readonly Variable[];
	readonly reactive: boolean;
	readonly preserveNative: boolean;
}

/** Describes the planned expression jsx operation. */
export interface ExpressionJsxPlan {
	readonly elements: ReadonlyMap<string, ExpressionJsxElementSite>;
	readonly cells: ReadonlyMap<string, ExpressionJsxCellSite>;
	/** Contextual parameter types that JSX lowering would otherwise erase. */
	readonly contextualParameters: ReadonlyMap<string, string>;
	readonly bindings: ReadonlyMap<string, ExpressionJsxBinding>;
	readonly lists: ReadonlyMap<string, ExpressionJsxListSite>;
	readonly diagnostics: readonly Readonly<{ message: string; start: number }>[];
}

/** Defines the expression jsx list site interface contract. */
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
		const tagBinding =
			!intrinsic && tagName
				? element
						.descendants()
						.references()
						.first((candidate) => candidate.name === tagName.split('.')[0])
				: undefined;
		const tagProvenance = tagBinding?.variable ? provenance.get(tagBinding.variable) : undefined;
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
			}),
			reactiveTag: tagProvenance?.provenance === 'derived' && tagProvenance.safeToReevaluate
		});
		elements.set(site.nodeId, site);
	}
	const reactiveCells = new Map(provenance.cells.map((cell) => [cell.node.id, cell]));
	const cells = new Map<string, ExpressionJsxCellSite>();
	for (const expression of module.walk().ofKind('JsxExpression')) {
		if (!expression.node.span) continue;
		const key = expression.node.id;
		const reactive = reactiveCells.get(key);
		const preserveNative =
			reactive === undefined &&
			expression
				.descendants()
				.calls()
				.any(
					(call) =>
						call.target?.isMember('map') === true &&
						isIntrinsicArrayMap(call) &&
						call.target.target?.rootVariable?.scope.kind === 'module'
				);
		const site = Object.freeze({
			nodeId: expression.node.id,
			start: expression.node.span.start,
			end: expression.node.span.end,
			kind:
				expression.parent?.node.kind === 'JsxAttribute'
					? ('jsx-attribute' as const)
					: ('jsx-child' as const),
			dependencies: reactive?.dependencies ?? module.dependenciesOf(expression),
			reactive: reactive !== undefined,
			preserveNative
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
	const diagnostics: Array<Readonly<{ message: string; start: number }>> = [];
	const diagnosedUnsafeDerived = new Set<string>();
	for (const expression of module.walk().ofKind('JsxExpression')) {
		for (const variable of module.dependenciesOf(expression)) {
			const entry = provenance.get(variable);
			if (entry?.provenance !== 'derived' || entry.safeToReevaluate) continue;
			if (!hasEagerReference(expression, variable)) continue;
			const source = unsafeDerivedSource(variable, provenance);
			if (diagnosedUnsafeDerived.has(source.id)) continue;
			diagnosedUnsafeDerived.add(source.id);
			diagnostics.push({
				message: `error: derived local ${source.name} cannot be safely reevaluated; inline the expression, use this.reactive(() => ...), or move effectful work into this.task()`,
				start: expression.node.span?.start ?? 0
			});
		}
	}
	const formBindings = analyzeFormBindings(module);
	const bindings = formBindings.bindings;
	diagnostics.push(...formBindings.diagnostics);
	const lists = new Map<string, ExpressionJsxListSite>();
	for (const call of module.walk().calls()) {
		if (
			!call.node.span ||
			!call.target?.isMember('map') ||
			/^this\.map$/.test(call.target.node.text ?? '')
		)
			continue;
		if (!call.ancestors().ofKind('JsxExpression').any() || !isIntrinsicArrayMap(call)) continue;
		const collection = call.target.target;
		// Module and imported collections are declarative constants, not component
		// reactive state. Preserve native Array.map so consumers such as routers
		// receive the authored child array instead of a live keyed-list boundary.
		if (collection?.rootVariable?.scope.kind === 'module') continue;
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
		bindings,
		lists,
		diagnostics: Object.freeze(diagnostics)
	});
}

/**
 * Reports whether a JSX expression reads a value while producing DOM.
 *
 * Event callbacks run later in response to the browser, so their captures retain
 * setup identity and must not force those values to become reactive derivations.
 */
function hasEagerReference(expression: NodeRef, variable: Variable): boolean {
	return expression
		.walk()
		.references()
		.where((reference) => reference.variable === variable)
		.any((reference) => !insideDeferredJsxHandler(reference, expression));
}

function insideDeferredJsxHandler(reference: NodeRef, expression: NodeRef): boolean {
	let sawFunction = false;
	let current = reference.parent;
	while (current) {
		if (current.node.kind === 'ArrowFunction' || current.node.kind === 'FunctionExpression')
			sawFunction = true;
		if (
			sawFunction &&
			current.node.kind === 'JsxAttribute' &&
			/^on[A-Z]/.test(current.node.name ?? '')
		)
			return true;
		if (current.node === expression.node) {
			const attribute = current.parent;
			return (
				sawFunction &&
				attribute?.node.kind === 'JsxAttribute' &&
				/^on[A-Z]/.test(attribute.node.name ?? '')
			);
		}
		current = current.parent;
	}
	return false;
}

function unsafeDerivedSource(
	variable: Variable,
	provenance: ExactProvenanceGraph,
	visited = new Set<string>()
): Variable {
	if (visited.has(variable.id)) return variable;
	visited.add(variable.id);
	const entry = provenance.get(variable);
	for (const dependency of entry?.dependencies ?? []) {
		const dependencyEntry = provenance.get(dependency);
		if (dependencyEntry?.provenance === 'derived' && !dependencyEntry.safeToReevaluate)
			return unsafeDerivedSource(dependency, provenance, visited);
	}
	return variable;
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
