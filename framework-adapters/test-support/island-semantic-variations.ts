/** Equivalent child expressions, crossed with values whose truthiness and absence differ. */
export const childExpressions = [
	['direct', 'props.children'],
	['literal', 'props["children"]'],
	['computed', 'props[String("children")]'],
	['parenthesized', '(props.children as Child)'],
	['conditional', 'props.children === props.children ? props.children : null'],
	['nullish', 'props[String("children")] ?? null'],
	['logical', 'props.children && props[String("children")]'],
	['array', '[props.children]'],
	['optional', 'props?.[String("children")]'],
	['helper', 'forwardChild(props.children)'],
	['computed-effect', 'props[readKey(props.id, this.state.count)]'],
	['nullish-effect', 'props[readKey(props.id, this.state.count)] ?? null'],
	['or-effect', 'props[readKey(props.id, this.state.count)] || null']
];

/** Authored expectations are independent of compiler output and source-expression evaluation. */
export const childInputs = [
	{ id: 'absent', attribute: '', text: '' },
	{ id: 'null-value', attribute: 'children={null}', text: '' },
	{ id: 'false-value', attribute: 'children={false}', text: '' },
	{ id: 'zero', attribute: 'children={0}', text: '0' },
	{ id: 'empty-string', attribute: 'children=""', text: '' },
	{ id: 'text', attribute: 'children="Forwarded"', text: 'Forwarded' },
	{ id: 'element', attribute: '', text: 'Forwarded' }
];

/** Generates a bounded cross-product inside existing adapter builds, avoiding a build per case. */
export function islandSemanticSource() {
	return (
		'function forwardChild(value: Child): Child { return value; }\n' +
		childExpressions
			.map(
				([, expression], index) => `
export function Semantic${index}(this: Component<{count:number}>, props: {children?:Child; id:string; label:string}) {
 this.state.count = 0;
 return () => <section data-semantic={props.id}>
  <button data-semantic-button onClick={() => this.state.count++}>{props[String("label")]} {this.state.count}</button>
  <ServerNote />
  <div data-semantic-child>{${expression}}</div>
 </section>;
}`
			)
			.join('\n')
	);
}

/** Places scalar and server-owned children into every equivalent source expression. */
export function islandSemanticInstances() {
	return childExpressions
		.flatMap(([id], index) =>
			childInputs.map(
				(input) =>
					`<Semantic${index} id="${id}-${input.id}" label="Count" ${input.attribute}>${input.id === 'element' ? '<span>Forwarded<input value="Initial" /></span>' : ''}</Semantic${index}>`
			)
		)
		.join('');
}
