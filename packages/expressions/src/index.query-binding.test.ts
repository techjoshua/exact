import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExpressionProject } from './test-support/project.js';

const root = path.resolve(import.meta.dirname, '../../..');
const kanbanConfig = path.join(root, 'apps/kanban/tsconfig.json');

describe('@exactjs/expressions: query and binding', () => {
	it('preserves source and exposes fluent typed JSX queries', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/components/ColumnView.tsx');
		const module = project.getModule(filename);

		expect(module.emit().code).toContain('export function ColumnView');
		expect(module.walk().functions().any()).toBe(true);
		expect(module.walk().calls().any()).toBe(true);
		expect(
			module
				.walk()
				.calls()
				.where((call) => call.target?.isMember('filter') === true)
				.any()
		).toBe(true);
		const elements = module.walk().jsxElements().toArray();
		expect(elements.length).toBeGreaterThan(5);
		expect(elements.some((element) => element.node.tagName === 'TaskCard')).toBe(true);
		expect(
			elements.every(
				(element) =>
					Array.isArray(element.node.attributes) && Array.isArray(element.node.jsxChildren)
			)
		).toBe(true);
		const lazyElement = elements[0]!.node;
		const textDescriptor = Object.getOwnPropertyDescriptor(lazyElement, 'text');
		expect(textDescriptor?.get).toBeTypeOf('function');
		expect(textDescriptor?.value).toBeUndefined();
		expect(lazyElement.text).toBe(
			module.source.slice(lazyElement.span!.start, lazyElement.span!.end)
		);
		expect(
			module
				.walk()
				.jsxAttributes()
				.any((attribute) => attribute.node.name === 'className')
		).toBe(true);
		expect(module.root.descendants().first()?.parent).toBeDefined();
	});

	it('uses one canonical variable object for every binding use', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_identity.ts');
		const source = `const outer = 1;
  export function total(items: number[]) {
  const local = 2;
  return items.map(item => item + outer + local);
  }`;
		const module = project.updateModule(filename, source);
		const identifiers = module
			.walk()
			.where((ref) => ref.node.kind === 'Identifier')
			.toArray();
		const outerUses = identifiers
			.filter((ref) => ref.node.name === 'outer')
			.map((ref) => ref.node.variable);
		const localUses = identifiers
			.filter((ref) => ref.node.name === 'local')
			.map((ref) => ref.node.variable);

		expect(new Set(outerUses).size).toBe(1);
		expect(new Set(localUses).size).toBe(1);
		const arrow = module
			.walk()
			.functions()
			.where((ref) => ref.node.kind === 'ArrowFunction')
			.single();
		expect(
			module
				.capturesOf(arrow)
				.map((variable) => variable.name)
				.sort()
		).toEqual(['local', 'outer']);
	});

	it('encapsulates binding mutability on canonical variables', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_mutability.ts');
		const module = project.updateModule(
			filename,
			`const fixed = 1; let changing = 2; function update(parameter: number) { changing = parameter; return fixed; }`
		);
		const variables = new Map(
			module
				.walk()
				.references()
				.toArray()
				.flatMap((reference) =>
					reference.variable ? [[reference.variable.name, reference.variable] as const] : []
				)
		);

		expect(variables.get('fixed')?.mutable).toBe(false);
		expect(variables.get('changing')?.mutable).toBe(true);
		expect(variables.get('parameter')?.mutable).toBe(true);
		expect(variables.get('update')?.mutable).toBe(false);
	});

	it('represents lexical this reads with their canonical binding', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__this_identity.ts');
		const module = project.updateModule(
			filename,
			`function Card(this: { state: { title: string } }) {
      const read = () => this.state.title;
      return read();
    }`
		);
		const thisReferences = module
			.walk()
			.references()
			.where((reference) => reference.name === 'this')
			.toArray();
		expect(thisReferences).toHaveLength(1);
		const fn = module
			.walk()
			.functions()
			.where((reference) => reference.node.kind === 'FunctionDeclaration')
			.single();
		expect(fn.node.parameters[0]).toBe(thisReferences[0]!.variable);
		const arrow = module
			.walk()
			.functions()
			.where((reference) => reference.node.kind === 'ArrowFunction')
			.single();
		expect(module.dependenciesOf(arrow).map((variable) => variable.name)).toContain('this');
		expect(module.capturesOf(arrow).map((variable) => variable.name)).toContain('this');
	});

	it('binds shorthand property values to their lexical variables', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__shorthand.ts');
		const module = project.updateModule(
			filename,
			'const signal = new AbortController().signal; const options = { signal };'
		);
		const signalReferences = module
			.walk()
			.references()
			.where(
				(reference) =>
					reference.name === 'signal' && reference.parent?.node.kind !== 'PropertyAccessExpression'
			)
			.toArray();
		expect(signalReferences.length).toBeGreaterThanOrEqual(2);
		expect(new Set(signalReferences.map((reference) => reference.variable))).toHaveLength(1);
	});

	it('reports subtree dependencies and read/write effects for compound updates', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__effects.ts');
		const module = project.updateModule(
			filename,
			'let total = 1; const add = (value: number) => total += value;'
		);
		const assignment = module
			.walk()
			.assignments()
			.where((reference) => reference.node.operator === '+=')
			.single();
		expect(
			module
				.dependenciesOf(assignment)
				.map((variable) => variable.name)
				.sort()
		).toEqual(['total', 'value']);
		expect(module.writesOf(assignment).map((variable) => variable.name)).toEqual(['total']);
		const totalEffects = module
			.effectsOf(assignment)
			.filter((effect) => effect.variable.name === 'total' && effect.kind !== 'capture')
			.map((effect) => effect.kind);
		expect(totalEffects).toEqual(['read', 'write']);
	});

	it('distinguishes member storage reads from property writes', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__member_effects.ts');
		const module = project.updateModule(filename, 'const model = { value: 1 }; model.value = 2;');
		const assignment = module.walk().assignments().single();
		expect(module.dependenciesOf(assignment).map((variable) => variable.name)).toEqual(['model']);
		expect(module.writesOf(assignment).map((variable) => variable.name)).toEqual(['value']);
	});
});
