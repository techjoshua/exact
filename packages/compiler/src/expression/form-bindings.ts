import type { BoundModule } from '@exactjs/expressions';

/** Compiler contract for a writable native-control binding. */
export interface ExpressionJsxBinding {
	readonly valueKind: 'string' | 'number' | 'boolean' | 'date';
	readonly empty: 'value' | 'null' | 'undefined';
	readonly control: 'value' | 'checked' | 'checkbox-group' | 'radio' | 'multiple';
	readonly element: 'input' | 'textarea' | 'select';
	readonly event: 'input' | 'change';
}

/** Validates native-control bindings and plans their conversion semantics. */
export function analyzeFormBindings(module: BoundModule): Readonly<{
	bindings: ReadonlyMap<string, ExpressionJsxBinding>;
	diagnostics: readonly Readonly<{ message: string; start: number }>[];
}> {
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
	return Object.freeze({
		bindings,
		diagnostics: Object.freeze(diagnostics)
	});
}
