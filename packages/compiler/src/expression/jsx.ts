import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { exactDirective, exactKeyContract, type ExactKeyContract } from '../annotations.js';
import { stableId } from '../ids.js';
import type { ExactProvenanceGraph } from '../provenance.js';

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

export interface ExpressionJsxBinding {
	readonly valueKind: 'string' | 'number' | 'boolean' | 'date';
	readonly empty: 'value' | 'null' | 'undefined';
	readonly control: 'value' | 'checked' | 'checkbox-group' | 'radio' | 'multiple';
	readonly element: 'input' | 'textarea' | 'select';
	readonly event: 'input' | 'change';
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
	const bindings = new Map<string, ExpressionJsxBinding>();
	for (const element of module.walk().jsxElements()) {
		if (!element.node.tagName || !/^[a-z]/.test(element.node.tagName)) continue;
		const attributes = element.node.attributes;
		const legacy = attributes.find(
			(attribute) => attribute.name === 'bindInput' || attribute.name === 'bindChange'
		);
		if (legacy) {
			diagnostics.push({
				message:
					'error: bindInput and bindChange were removed; use value:input, value:change, or checked:change',
				start: legacy.span?.start ?? element.node.span?.start ?? 0
			});
			continue;
		}
		const binders = attributes.filter(
			(attribute) => !!attribute.name && /^(value|checked):/.test(attribute.name)
		);
		if (!binders.length) continue;
		const start = binders[0]?.span?.start ?? element.node.span?.start ?? 0;
		if (binders.length > 1) {
			diagnostics.push({ message: 'error: an element may declare only one binding', start });
			continue;
		}
		const attribute = binders[0]!;
		if (
			attribute.name !== 'value:input' &&
			attribute.name !== 'value:change' &&
			attribute.name !== 'checked:change'
		) {
			diagnostics.push({
				message:
					'error: supported reactive form attributes are value:input, value:change, and checked:change',
				start
			});
			continue;
		}
		const [boundProperty, boundEvent] = attribute.name.split(':') as [
			'value' | 'checked',
			'input' | 'change'
		];
		const initializer =
			attribute.initializer?.kind === 'JsxExpression'
				? attribute.initializer.children.find((child) => child.category === 'expression')
				: attribute.initializer;
		if (
			!initializer ||
			!['PropertyAccessExpression', 'ElementAccessExpression'].includes(initializer.kind)
		) {
			diagnostics.push({
				message: `error: ${attribute.name} requires one writable reactive location`,
				start
			});
			continue;
		}
		const type = initializer.type;
		if (!type) continue;
		const members = type.unionMembers.length ? type.unionMembers : [type];
		const hasNull = members.some((member) => member.kind === 'null');
		const hasUndefined = members.some((member) => member.kind === 'undefined');
		if (hasNull && hasUndefined) {
			diagnostics.push({
				message: `error: ${attribute.name} cannot infer an empty value from both null and undefined`,
				start
			});
			continue;
		}
		const values = members.filter(
			(member) => member.kind !== 'null' && member.kind !== 'undefined'
		);
		const primitiveKinds = new Set(values.map((member) => member.kind));
		if (!values.length || primitiveKinds.size > 1) {
			diagnostics.push({
				message: `error: ${attribute.name} requires a string, number, Date, or homogeneous array`,
				start
			});
			continue;
		}
		const value = values[0]!;
		const array = !!value.collectionKind;
		const scalar = array ? value.typeArguments[0] : value;
		const scalarMembers = scalar?.unionMembers.length
			? scalar.unionMembers
			: scalar
				? [scalar]
				: [];
		const scalarKinds = new Set(
			scalarMembers.map((member) =>
				member.kind === 'string' || member.kind === 'number' || member.kind === 'boolean'
					? member.kind
					: member.display === 'Date'
						? 'date'
						: undefined
			)
		);
		const valueKind =
			scalarKinds.size === 1
				? ([...scalarKinds][0] as 'string' | 'number' | 'boolean' | 'date' | undefined)
				: undefined;
		if (!valueKind) {
			diagnostics.push({
				message: `error: ${attribute.name} requires a string, number, Date, or homogeneous array`,
				start
			});
			continue;
		}
		const staticType = attributes
			.find((candidate) => candidate.name === 'type')
			?.initializer?.text?.replace(/^['"]|['"]$/g, '');
		const multiple = attributes.some((candidate) => candidate.name === 'multiple');
		const control =
			element.node.tagName === 'select' && multiple
				? 'multiple'
				: staticType === 'checkbox'
					? array
						? 'checkbox-group'
						: 'checked'
					: staticType === 'radio'
						? 'radio'
						: 'value';
		if (!['input', 'textarea', 'select'].includes(element.node.tagName)) {
			diagnostics.push({
				message: `error: ${attribute.name} is supported only on input, textarea, and select`,
				start
			});
			continue;
		}
		const generatedProp =
			control === 'checked' || control === 'checkbox-group' || control === 'radio'
				? 'checked'
				: 'value';
		const requiredEvent =
			control === 'checked' ||
			control === 'checkbox-group' ||
			control === 'radio' ||
			element.node.tagName === 'select'
				? 'change'
				: boundEvent;
		if (boundProperty !== generatedProp || boundEvent !== requiredEvent) {
			diagnostics.push({
				message: `error: ${attribute.name} is not supported by this control; use ${generatedProp}:${requiredEvent}`,
				start
			});
			continue;
		}
		if (valueKind === 'boolean' && control !== 'checked') {
			diagnostics.push({
				message: `error: boolean bindings require an input with type="checkbox"`,
				start
			});
			continue;
		}
		if (
			(array && control !== 'multiple' && control !== 'checkbox-group') ||
			(!array && (control === 'multiple' || control === 'checkbox-group'))
		) {
			diagnostics.push({
				message: `error: ${attribute.name} array values require <select multiple> or checkbox inputs`,
				start
			});
			continue;
		}
		if (array && valueKind !== 'string' && valueKind !== 'number') {
			diagnostics.push({
				message: `error: ${attribute.name} arrays must contain strings or numbers`,
				start
			});
			continue;
		}
		if (
			control === 'checkbox-group' &&
			!attributes.some((candidate) => candidate.name === 'value')
		) {
			diagnostics.push({
				message: `error: checkbox array bindings require an explicit value prop`,
				start
			});
			continue;
		}
		if (valueKind === 'date' && (element.node.tagName !== 'input' || staticType !== 'date')) {
			diagnostics.push({
				message: `error: ${attribute.name} Date values require <input type="date">`,
				start
			});
			continue;
		}
		if (attributes.some((candidate) => candidate.name === generatedProp)) {
			diagnostics.push({
				message: `error: ${attribute.name} cannot be combined with an explicit ${generatedProp} prop`,
				start
			});
			continue;
		}
		bindings.set(attribute.initializer!.id, {
			valueKind,
			empty: hasNull ? 'null' : hasUndefined ? 'undefined' : 'value',
			control,
			element: element.node.tagName as 'input' | 'textarea' | 'select',
			event: boundEvent
		});
	}
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
