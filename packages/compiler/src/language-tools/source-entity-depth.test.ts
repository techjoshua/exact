import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { clearExpressionProjectCache, transformSource } from '../index.js';
import { createExactBuildInspectionCatalog } from './build-catalog.js';
import { createExactRuntimeInspectionCorrelation } from './runtime-correlation.js';
import { inspectedTasks } from './refactor-equivalence.js';
import { planExactTaskRefactor } from './task-refactor.js';
import type { ExactSourceEntity } from './contracts.js';

afterEach(() => clearExpressionProjectCache());

/** Stresses inspection consumers independently of the native parser's source nesting limits. */
function deepInspection(source = 'function Panel() { return () => <p />; }') {
	const root = path.resolve('workspace');
	const filename = path.join(root, 'src', 'Panel.tsx');
	const inspection = transformSource(source, { filename, emitInspection: true }).inspectionCatalog!;
	const component = inspection.components[0]!;
	const pending = [...component.children];
	let task: ExactSourceEntity | undefined;
	while (pending.length) {
		const candidate = pending.pop()!;
		if (candidate.classification?.kind === 'task') {
			task = candidate;
			break;
		}
		pending.push(...candidate.children);
	}
	let entity: ExactSourceEntity = task ?? {
		id: 'leaf',
		kind: 'render-expression',
		range: component.range,
		selectionRange: component.selectionRange,
		children: [],
		reasons: []
	};
	const leaf = entity;
	for (let index = 0; index < 20_000; index++)
		entity = {
			id: 'deep:' + index,
			kind: 'render-expression',
			range: component.range,
			selectionRange: component.selectionRange,
			children: [entity],
			reasons: []
		};
	return {
		root,
		filename,
		source,
		leaf,
		inspection: { ...inspection, components: [{ ...component, children: [entity] }] }
	};
}

it('projects deep source entities into an independent runtime catalog', () => {
	const { root, filename, source, inspection, leaf } = deepInspection();
	const catalog = createExactBuildInspectionCatalog({
		buildKey: 'build',
		root,
		roots: [
			{
				executionRoot: 'page',
				rootComponentId: inspection.components[0]!.id,
				inspections: [inspection],
				sources: { [filename]: source }
			}
		]
	});
	let entity = catalog.roots.page!.files[0]!.components[0]!;
	let count = 0;
	while (entity.children.length) {
		entity = entity.children[0]!;
		count++;
	}
	expect(count).toBe(20_001);
	expect(entity.id).toBe('leaf');
	expect(Reflect.set(entity, 'id', 'edited observation')).toBe(true);
	expect(leaf.id).toBe('leaf');
});

it('selects the original classified task beneath deep inspection regions', () => {
	const { filename, source, inspection, leaf } = deepInspection(`export async function Panel(
		this: Component<{ value?: string }>, props: { id: string }
	) {
		this.state.value = await load(props.id);
		return () => <p>{this.state.value}</p>;
	}`);
	expect(leaf.classification?.kind).toBe('task');
	expect(inspectedTasks(inspection)).toEqual([leaf]);
	expect(
		planExactTaskRefactor(
			{
				generation: inspection.generation,
				filename,
				range: leaf.range,
				kind: 'convert-to-explicit-task'
			},
			source,
			inspection
		)?.semanticChange
	).toBe('none');
});

it('projects every deep runtime slot in source traversal order', () => {
	const { inspection } = deepInspection();
	const slots = createExactRuntimeInspectionCorrelation(inspection).components[0]!.slots;
	expect(slots).toHaveLength(20_001);
	expect(slots[0]!.id).toBe('deep:19999');
	expect(slots.at(-1)!.id).toBe('leaf');
});

it('searches deep inspection trees for classified tasks', () => {
	const { inspection } = deepInspection();
	expect(inspectedTasks(inspection)).toEqual([]);
});

it('withholds task refactors after searching a deep tree without a task', () => {
	const { filename, source, inspection } = deepInspection();
	expect(
		planExactTaskRefactor(
			{
				generation: inspection.generation,
				filename,
				range: inspection.components[0]!.range,
				kind: 'convert-to-explicit-task'
			},
			source,
			inspection
		)
	).toBeUndefined();
});
